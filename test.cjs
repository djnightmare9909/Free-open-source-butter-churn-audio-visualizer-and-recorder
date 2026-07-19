const fs = require('fs');
const code = fs.readFileSync('node_modules/butterchurn/lib/butterchurn.js', 'utf8');
const methods = [];
const regex = /key:\s*"([^"]+)"/g;
let m;
while ((m = regex.exec(code)) !== null) {
  if (!methods.includes(m[1])) methods.push(m[1]);
}
console.log(methods.join(', '));
