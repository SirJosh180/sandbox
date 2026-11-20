// Local development server. On Vercel, api/index.js is used instead.
const app = require('./lib/app');
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`SandBox running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`));
