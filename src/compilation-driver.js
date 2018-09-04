// The compilation driver reads files and invokes the parser and analysis passes.

const fs = require("fs");

const parsers = require("./parse");
const run_visitor = require("./ast-visitor");

// Creates a new compilation driver with methods for analyzing, compiling etc.
//
// Expected options:
//   - base: path to the project directory to compile
//   - features: set of enabled features (strings)
//   - deps: whether to build the dependencies as well
module.exports = (options) => {
  const driver = {
    options,
    ast_cache: {},
    analyze: () => analyze(driver),
  };

  return driver;
};

// Create a fully analyzed ASG, throw if it contains invalid constructs.
function analyze(driver) {
  let base_ast = get_or_load_ast(driver, {
    module: "mod",
    path: driver.options.base,
  });

  resolve_item_bindings(driver, base_ast);

  // TODO
}

// Either retrieve an AST from the driver's cache, or read a file and parse it.
function get_or_load_ast(driver, data) {
  if (driver.ast_cache[data.module]) {
    return driver.ast_cache[data.module];
  } else {
    let ast = {
      driver
    };
    do_parse(ast, data.path);
    return ast;
  }
}

// Get an AST from the driver's cache, throw if not available.
function get_ast(driver, module) {
  if (driver.ast_cache[module]) {
    return driver.ast_cache[module];
  } else {
    throw "Could not get ast: " + module;
  }
}

// Read a fiele from the fs and parse it into an AST.
function do_parse(ast, path) {
  const src = fs.readFileSync(path, "utf8");
  ast.root = parsers(ast).file.tryParse(src);
}

// Add binding sites for items, and resolve bindings in `use`s.
// Also creates bindings for the tags of ADTs.
// This is indirectly responsible for all `do_parse` calls (except the very first one).
function resolve_item_bindings(driver, base_ast) {
  run_visitor({
    pre_item: item => {
      // TODO
      return false;
    }
  }, base_ast);
  // TODO ?
}

// Generate C code.
function compile(driver) {
  // TODO
}
