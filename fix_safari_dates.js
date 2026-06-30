const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Add parseDateTime method to the class.
// We'll insert it right after getLocalDateStr method.
if (!code.includes('parseDateTime(dateStr, timeStr)')) {
  code = code.replace(
    '  getLocalDateStr(d) {',
    '  parseDateTime(dateStr, timeStr) {\n    if (!dateStr || !timeStr) return new Date();\n    const [year, month, day] = dateStr.split(\'-\');\n    const [hour, minute] = timeStr.split(\':\');\n    return new Date(year, month - 1, day, hour, minute);\n  }\n\n  getLocalDateStr(d) {'
  );
}

// Replace new Date(`${...}T${...}`).getTime()
// Patterns:
// new Date(`${b.date}T${b.startTime}`) -> this.parseDateTime(b.date, b.startTime)
// new Date(`${b.date}T${b.endTime}`) -> this.parseDateTime(b.date, b.endTime)
// new Date(`${currentActive.date}T${currentActive.endTime}`) -> this.parseDateTime(currentActive.date, currentActive.endTime)
// new Date(`${currentActive.date}T${currentActive.startTime}`) -> this.parseDateTime(currentActive.date, currentActive.startTime)
// new Date(`${a.date}T${a.startTime}`) -> this.parseDateTime(a.date, a.startTime)
// new Date(`${data}T${oraInceput}`) -> this.parseDateTime(data, oraInceput)
// new Date(`${data}T${oraSfarsit}`) -> this.parseDateTime(data, oraSfarsit)

code = code.replace(/new Date\(`\$\{([^}]+)\}T\$\{([^}]+)\}`\)/g, 'this.parseDateTime($1, $2)');

fs.writeFileSync('app.js', code);
console.log("Replaced successfully!");
