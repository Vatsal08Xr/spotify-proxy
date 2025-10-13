FROM node:18-alpine
WORKDIR /app
RUN npm init -y && npm install express node-fetch
RUN echo "const express = require('express');\
const fetch = require('node-fetch');\
const app = express();\
const port = process.env.PORT || 10000;\
app.get('/track/:id', async (req, res) => {\
  try {\
    const id = req.params.id;\
    const response = await fetch(\`https://api.spotify.com/v1/tracks/\${id}\`);\
    if (!response.ok) throw new Error('Spotify error');\
    const data = await response.json();\
    res.json(data);\
  } catch (err) {\
    res.status(404).json({ error: 'Track not found' });\
  }\
});\
app.listen(port, () => console.log(\`Running on \${port}\`));" > server.js
CMD ["node", "server.js"]
