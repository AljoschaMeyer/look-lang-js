let fs = require("fs");

let lang = require("../src/parse");

let src = fs.readFileSync("guide/src/lib.oo", "utf8");

lang.file.tryParse(src);
