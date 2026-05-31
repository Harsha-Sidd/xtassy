// Helper to execute single Redis command using native global fetch (standard in Node 18+)
const redisCall = async (command) => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("MISSING_UPSTASH_CONFIG");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const resData = await response.json();
  if (resData.error) {
    throw new Error(resData.error);
  }
  return resData.result;
};

// Helper to execute command pipeline
const redisPipeline = async (commands) => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("MISSING_UPSTASH_CONFIG");
  }
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });
  const resData = await response.json();
  return resData.map(r => r.result);
};

exports.handler = async (event, context) => {
  // Set up standard JSON headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const path = event.path.replace(/\.netlify\/functions\/api\/?/, "").replace(/\/api\/?/, "");
    
    // Check if configuration is present
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "CONFIGURATION_ERROR",
          message: "Upstash Redis environment variables are missing. Please add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to your Netlify site settings."
        })
      };
    }

    // --- UPLOAD FILE ENDPOINT ---
    if (path.startsWith("upload") && event.httpMethod === "POST") {
      const { fileData, mimeType, originalName } = JSON.parse(event.body);
      if (!fileData) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fileData" }) };
      }

      const fileBlobId = "file_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
      
      // Store in Redis with 24 hours expiry (since it is ephemeral E2EE file storage)
      const filePayload = JSON.stringify({ fileData, mimeType, originalName });
      await redisCall(["SETEX", `xtassy:file:${fileBlobId}`, 86400, filePayload]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ fileBlobId })
      };
    }

    // --- DOWNLOAD/RETRIEVE FILE ENDPOINT ---
    if (path.startsWith("file/") && event.httpMethod === "GET") {
      const fileBlobId = path.split("file/")[1];
      if (!fileBlobId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fileBlobId" }) };
      }

      const filePayloadRaw = await redisCall(["GET", `xtassy:file:${fileBlobId}`]);
      if (!filePayloadRaw) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "File not found or already burned" }) };
      }

      const fileData = JSON.parse(filePayloadRaw);
      
      // Return binary file using custom headers
      const downloadHeaders = {
        ...headers,
        "Content-Type": fileData.mimeType,
        "Content-Disposition": `attachment; filename="${fileData.originalName}"`
      };

      return {
        statusCode: 200,
        headers: downloadHeaders,
        isBase64Encoded: true,
        body: fileData.fileData // This is a Base64 string, so isBase64Encoded works natively in Netlify!
      };
    }

    // --- MAIN API SERVICE ENDPOINT (POLLING, MESSAGING, ACTIONS) ---
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);
      const { action } = body;

      // 1. REGISTER ACTION
      if (action === "register") {
        const { username } = body;
        if (!username) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Username is required" }) };
        }
        const cleanName = username.trim().toLowerCase();
        const now = Date.now();

        // Save username to active list and presence map
        await redisPipeline([
          ["HSET", "xtassy:users", cleanName, JSON.stringify({ username: username.trim(), lastActive: now })],
          ["PUBLISH", "xtassy:presence", JSON.stringify({ username: username.trim(), online: true })]
        ]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, username: username.trim() })
        };
      }

      // 2. POLL ACTION
      if (action === "poll") {
        const { username } = body;
        if (!username) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Username is required" }) };
        }
        const cleanName = username.trim().toLowerCase();
        const now = Date.now();

        // Retrieve active users, messages, and typing statuses
        const [usersRaw, messagesRaw, typingRaw] = await redisPipeline([
          ["HGETALL", "xtassy:users"],
          ["HGETALL", "xtassy:messages"],
          ["HGETALL", "xtassy:typing"]
        ]);

        // Keep active users whose timestamps are within the last 12 seconds
        const onlineUsers = [];
        const usersToPrune = [];
        
        if (usersRaw) {
          // Upstash HGETALL returns flat array of key, val, key, val...
          for (let i = 0; i < usersRaw.length; i += 2) {
            const fieldName = usersRaw[i];
            const data = JSON.parse(usersRaw[i+1]);
            
            // If fieldName is the current polling user, update its lastActive timestamp
            if (fieldName === cleanName) {
              data.lastActive = now;
              await redisCall(["HSET", "xtassy:users", cleanName, JSON.stringify(data)]);
            }

            if (now - data.lastActive < 12000) {
              onlineUsers.push(data.username);
            } else {
              usersToPrune.push(fieldName);
            }
          }
        }

        // Clean up offline users from Redis hash to prevent bloat
        if (usersToPrune.length > 0) {
          const deleteCommands = usersToPrune.map(u => ["HDEL", "xtassy:users", u]);
          await redisPipeline(deleteCommands);
        }

        // Filter and construct messages list
        const messages = [];
        const messagesToBurn = [];

        if (messagesRaw) {
          for (let i = 0; i < messagesRaw.length; i += 2) {
            const msgId = messagesRaw[i];
            const msg = JSON.parse(messagesRaw[i+1]);

            // Group chat rooms (starts with '#')
            const isGroup = msg.recipient.startsWith('#');
            const isTarget = isGroup || 
                             msg.sender.toLowerCase() === cleanName || 
                             msg.recipient.toLowerCase() === cleanName;

            if (isTarget) {
              // Handle server-side burn countdown triggers
              if (msg.status === "read" && msg.readAt) {
                const elapsed = (now - msg.readAt) / 1000;
                if (elapsed >= msg.burnTime) {
                  messagesToBurn.push(msgId);
                  continue; // Exclude burned message from response
                }
              }

              // Auto-trigger read timer for incoming unread direct messages (not group chats)
              if (!isGroup && msg.recipient.toLowerCase() === cleanName && msg.status !== "read") {
                msg.status = "read";
                msg.readAt = now;
                await redisCall(["HSET", "xtassy:messages", msgId, JSON.stringify(msg)]);
              }

              messages.push(msg);
            }
          }
        }

        // Execute server-side burns
        if (messagesToBurn.length > 0) {
          const deleteMsgCommands = messagesToBurn.map(id => ["HDEL", "xtassy:messages", id]);
          await redisPipeline(deleteMsgCommands);
        }

        // Parse active typing indicators
        const typing = {};
        if (typingRaw) {
          for (let i = 0; i < typingRaw.length; i += 2) {
            const key = typingRaw[i];
            const timestamp = parseInt(typingRaw[i+1]);
            
            // Check if typing indicator has expired (keep alive for 3 seconds max)
            if (now - timestamp < 3000) {
              const [senderName, recipientName] = key.split(":");
              if (recipientName.toLowerCase() === cleanName) {
                typing[senderName] = true;
              }
            }
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            onlineUsers,
            messages,
            typing
          })
        };
      }

      // 3. SEND MESSAGE ACTION
      if (action === "send_message") {
        const { sender, recipient, ciphertext, iv, salt, fileMeta, fileBlobId, burnTime } = body;
        if (!sender || !recipient || !ciphertext || !iv || !salt) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid send_message payload" }) };
        }

        const msgId = "msg_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
        const newMsg = {
          id: msgId,
          sender,
          recipient,
          ciphertext,
          iv,
          salt,
          fileMeta,
          fileBlobId,
          burnTime,
          status: "sent",
          createdAt: Date.now(),
          readAt: null,
          reactions: {}
        };

        await redisCall(["HSET", "xtassy:messages", msgId, JSON.stringify(newMsg)]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: newMsg })
        };
      }

      // 4. MARK READ ACTION
      if (action === "mark_read") {
        const { messageId } = body;
        if (!messageId) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messageId" }) };
        }

        const rawMsg = await redisCall(["HGET", "xtassy:messages", messageId]);
        if (rawMsg) {
          const msg = JSON.parse(rawMsg);
          if (msg.status !== "read") {
            msg.status = "read";
            msg.readAt = Date.now();
            await redisCall(["HSET", "xtassy:messages", messageId, JSON.stringify(msg)]);
          }
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: msg }) };
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: "Message not found" }) };
      }

      // 5. BURN MESSAGE ACTION
      if (action === "burn_message") {
        const { messageId } = body;
        if (!messageId) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing messageId" }) };
        }

        await redisCall(["HDEL", "xtassy:messages", messageId]);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      // 6. TYPING STATUS ACTION
      if (action === "typing_status") {
        const { sender, recipient, isTyping } = body;
        if (!sender || !recipient) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing parameters" }) };
        }
        
        const key = `${sender.toLowerCase()}:${recipient.toLowerCase()}`;
        if (isTyping) {
          await redisCall(["HSET", "xtassy:typing", key, Date.now().toString()]);
        } else {
          await redisCall(["HDEL", "xtassy:typing", key]);
        }

        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      // 7. REACT MESSAGE ACTION
      if (action === "react_message") {
        const { messageId, username, emoji } = body;
        if (!messageId || !username || !emoji) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing parameters" }) };
        }

        const rawMsg = await redisCall(["HGET", "xtassy:messages", messageId]);
        if (rawMsg) {
          const msg = JSON.parse(rawMsg);
          if (!msg.reactions) msg.reactions = {};
          msg.reactions[username] = emoji;
          
          await redisCall(["HSET", "xtassy:messages", messageId, JSON.stringify(msg)]);
          return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 404, headers, body: JSON.stringify({ error: "Message not found" }) };
      }

      // 8. PANIC NUKE ACTION
      if (action === "panic_nuke") {
        // Purge the database completely
        const keys = await redisCall(["KEYS", "xtassy:*"]);
        if (keys && keys.length > 0) {
          const nukeCommands = keys.map(k => ["DEL", k]);
          await redisPipeline(nukeCommands);
        }
        await redisPipeline([
          ["DEL", "xtassy:users"],
          ["DEL", "xtassy:messages"],
          ["DEL", "xtassy:typing"]
        ]);

        return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: "STACKS NUKED" }) };
      }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Endpoint not found" }) };

  } catch (error) {
    console.error("Serverless handler error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "SERVER_ERROR", message: error.message })
    };
  }
};
