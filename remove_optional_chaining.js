const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// document.getElementById('X')?.addEventListener -> 
// const elX = document.getElementById('X'); if (elX) elX.addEventListener
code = code.replace(/document\.getElementById\('([^']+)'\)\?\.addEventListener/g, "let btn_$1 = document.getElementById('$1');\n    if (btn_$1) btn_$1.addEventListener");

// this.loggedInUser?.name -> (this.loggedInUser ? this.loggedInUser.name : null)
code = code.replace(/this\.loggedInUser\?\.name/g, "(this.loggedInUser ? this.loggedInUser.name : null)");

fs.writeFileSync('app.js', code);
console.log('Replaced optional chaining successfully.');
