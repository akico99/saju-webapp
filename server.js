'use strict';
require('dotenv').config();
const app = require('./src/server/app');

const PORT = process.env.PORT || 4500;
app.listen(PORT, () => {
  console.log(`saju-webapp 서버 실행 중: http://localhost:${PORT}`);
});
