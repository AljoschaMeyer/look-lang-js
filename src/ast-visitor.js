// A visitor that walks ASTs.
//
// When run, the visitor objects calls functions corresponding to the different
// types  of AST nodes if they are defined, passing a reference to the node. If
// the function returns thruthy, the node's children are visited.
//
// Nodes which are excluded due to conditional compilation are skipped.

// The exported function takes an object of visitor functions and an ast to
// visit, and invokes the given functions.
module.exports.run_visitor = (funs, ast) => {
  // Look at the attrs on a node and check conditional compilation flags.
  const should_compile = node => {
    for (let i = 0; i < node.value.attrs.length; i++) {
      if (
        node.value.attrs[i].value.name == "AttrCc" &&
        (ast.driver.options.features[node.value.attrs[i].value.value] == undefined)
      ) {
        return false;
      }
    }
    return true;
  }

  const visit_item = node => {
    if (!funs.pre_item || funs.pre_item(node)) {
      switch (node.name) {
        case "ItemType":
          visit_type_def(node.value.def);
          break;
        case "ItemFfiVal":
          visit_type(node.value.type);
          break;
        case "ItemVal":
          visit_pattern(node.value.pattern);
          visit_exp_def(node.value.def);
          break;
        case "ItemUse":
          /* noop*/
          break;
        case "ItemFfiInclude":
          /* noop*/
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_item) {
        funs.post_item(node);
      }
    }
  };

  const visit_type_def = node => {
    if (!funs.pre_type_def || funs.pre_type_def(node)) {
      switch (node.name) {
        case "TypeDefGeneric":
          visit_type_def(node.value.def);
          break;
        case "TypeDefADT":
          /* noop */
          break;
        case "TypeDefAnon":
          visit_type(node.value)
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_type_def) {
        funs.post_type_def(node);
      }
    }
  };

  const visit_type = node => {
    if (!funs.pre_type || funs.pre_type(node)) {
      switch (node.name) {
        case "TypePrimitive":
          /* noop */
          break;
        case "TypeId":
          /* noop */
          break;
        case "TypeTuple":
          node.value.forEach(visit_type);
          break;
        case "TypeFun":
          node.value.args.forEach(visit_type);
          visit_type(node.value.ret);
          break;
        case "TypePtr":
          visit_type(node.value);
          break;
        case "TypePtrMut":
          visit_type(node.value);
          break;
        case "TypeMany":
          visit_type(node.value);
          break;
        case "TypeManyMut":
          visit_type(node.value);
          break;
        case "TypeRepeated":
          visit_type(node.value.inner);
          break;
        case "TypeApp":
          visit_type(node.value.generic_type);
          node.value.args.forEach(visit_type);
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_type) {
        funs.post_type(node);
      }
    }
  };

  const visit_pattern = node => {
    if (!funs.pre_pattern || funs.pre_pattern(node)) {
      switch (node.name) {
        case "ExpLiteralBool":
          /* noop */
          break;
        case "ExpLiteralFloat":
          /* noop */
          break;
        case "ExpLiteralInt":
          /* noop */
          break;
        case "PatternBlank":
          /* noop */
          break;
        case "PatternSkip":
          /* noop */
          break;
        case "PatternAdtNoFields":
          /* noop */
          break;
        case "PatternAdtFieldsAnon":
          node.value.fields.forEach(visit_pattern);
          break;
        case "PatternAdtFieldsNamed":
          node.value.fields.forEach(inner => {
            if (inner.pattern) { // Conditional because this might be a PatternSkip instead
              visit_pattern(inner.pattern);
            }
          });
          break;
        case "PatternTuple":
          node.value.forEach(visit_pattern);
          break;
        case "PatternPtr":
          visit_pattern(node.value);
          break;
        case "PatternNamed":
          visit_pattern(node.value.binding);
          visit_pattern(node.value.inner);
          break;
        case "PatternBinding":
          if (node.value.annotation) {
            visit_type(node.value.annotation);
          }
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_pattern) {
        funs.post_pattern(node);
      }
    }
  };

  const visit_exp_def = node => {
    if (!funs.pre_exp_def || funs.pre_exp_def(node)) {
      switch (node.name) {
        case "ExpDefGenericFun":
          visit_exp(node.value.fun);
          break;
        case "ExpDefAnon":
          visit_exp(node.value);
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_exp_def) {
        funs.post_exp_def(node);
      }
    }
  };

  const visit_exp = node => {
    if (!funs.pre_exp || funs.pre_exp(node)) {
      switch (node.name) {
        case "ExpLiteralBool":
          /* noop */
          break;
        case "ExpLiteralFloat":
          /* noop */
          break;
        case "ExpLiteralInt":
          /* noop */
          break;
        case "ExpId":
          /* noop */
          break;
        case "ExpRepeated":
          visit_exp(node.value.inner);
          break;
        case "ExpTuple":
          node.value.forEach(visit_exp);
          break;
        case "ExpFun":
          node.value.args.forEach(visit_pattern);
          visit_type(node.value.ret);
          visit_block(node.value.body);
          break;
        case "ExpSizeof":
          visit_type(node.value.inner);
          break;
        case "ExpIf":
          visit_exp(node.value.cond);
          visit_block(node.value.if_block);
          if (node.value.else_block) {
            visit_block(node.value.else_block);
          }
          break;
        case "ExpWhile":
          visit_exp(node.value.cond);
          visit_block(node.value.body);
          break;
        case "ExpCase":
          visit_exp(node.value.exp);
          node.value.cases.forEach(c => {
            c.patterns.forEach(visit_pattern);
            visit_block(c.block);
          });
          break;
        case "ExpLoop":
          visit_exp(node.value.exp);
          node.value.cases.forEach(c => {
            c.patterns.forEach(visit_pattern);
            visit_block(c.block);
          });
          break;
        case "ExpPtr":
          visit_exp(node.value);
          break;
        case "ExpPtrMut":
          visit_exp(node.value);
          break;
        case "ExpMany":
          visit_exp(node.value);
          break;
        case "ExpManyMut":
          visit_exp(node.value);
          break;
        case "ExpTupleAccess":
          visit_exp(node.value.tuple);
          break;
        case "ExpStructAccess":
          visit_exp(node.value.struct);
          break;
        case "ExpFunApp":
          visit_exp(node.value.callee);
          node.value.type_args.forEach(visit_type);
          node.value.args.forEach(visit_exp);
          break;
        case "ExpFunAppNamed":
          visit_exp(node.value.callee);
          node.value.type_args.forEach(visit_type);
          node.value.args.forEach(arg => visit_exp(arg.exp));
          break;
        case "ExpLand":
          visit_exp(node.value.lhs);
          visit_exp(node.value.rhs);
          break;
        case "ExpLor":
          visit_exp(node.value.lhs);
          visit_exp(node.value.rhs);
          break;
        case "ExpDeref":
          visit_exp(node.value);
          break;
        case "ExpDerefMut":
          visit_exp(node.value);
          break;
        case "ExpIndex":
          visit_exp(node.value.many);
          visit_exp(node.value.index);
          break;
        case "ExpAs":
          visit_exp(node.value.exp);
          visit_type(node.value.type);
          break;
        case "ExpBlock":
          visit_block(node.value);
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_exp) {
        funs.post_exp(node);
      }
    }
  };

  const visit_stmt = node => {
    if (!funs.pre_stmt || funs.pre_stmt(node)) {
      switch (node.name) {
        case "StmtExp":
          visit_exp(node.value);
          break;
        case "StmtHalt":
          /* noop */
          break;
        case "StmtUnreachable":
          /* noop */
          break;
        case "StmtVal":
          visit_pattern(node.value.pattern);
          if (node.value.def) {
            visit_exp(node.value.def);
          }
          break;
        case "StmtAssign":
          visit_exp(node.value.lhs);
          visit_exp(node.value.rhs);
          break;
        case "StmtBreak":
          if (node.value.exp) {
            visit_exp(node.value.exp);
          }
          break;
        case "StmtReturn":
          if (node.value.exp) {
            visit_exp(node.value.exp);
          }
          break;
        case "StmtGoto":
          /* noop */
          break;
        case "StmtLabel":
          /* noop */
          break;
        default:
          console.log(require('util').inspect(node, { depth: null }));
          throw node.name;
      }

      if (funs.post_stmt) {
        funs.post_stmt(node);
      }
    }
  };

  const visit_block = block => {
    block.forEach(stmt => {
      if (should_compile(stmt)) {
        visit_stmt(stmt);
      }
    });
  }

  ast.root.value.forEach(item => {
    if (should_compile(item)) {
      visit_item(item);
    }
  });
}
