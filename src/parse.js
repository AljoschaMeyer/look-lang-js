let P = require("parsimmon");

module.exports = P.createLanguage({
  file: r => r.skip
    .then(r.item.many()).node("File")
    .skip(P.eof),

  comment: () => P.regex(/\/\/[^\n]*[\n]/).desc("linecomment"),
  ws: () => P.oneOf(" \n"),
  ignored: r => P.alt(r.ws, r.comment).desc("whitespace"),
  skip: r => r.ignored.many(),

  sid: r => P.regex(/[_a-zA-Z][_a-zA-Z0-9]{0,127}/)
    .desc("simple identifier")
    .node("Sid")
    .skip(r.skip),

  id: r => r.sid.sepBy1(P.string("::").skip(r.skip))
    .node("Id"),

  attr: r => P.alt(r.attr_cc, r.attr_test)
    .wrap(P.string("#["), P.string("]"))
    .node("Attr")
    .skip(r.skip),

  attr_cc: r => P.regex(/\w*/)
    .wrap(P.string("cc("), P.string(")"))
    .node("AttrCc")
    .skip(r.skip),

  attr_test: r => P.alt(
      P.string("test_pure").result(true),
      P.string("test").result(false)
    )
    .node("AttrTest")
    .skip(r.skip),

  pub: r => P.string("pub").result(true).mark().fallback(null)
    .skip(r.skip),

  mut: r => P.string("mut").result(true).mark().fallback(null)
    .skip(r.skip),

  item: r => P.seqMap(
      r.attr.many(),
      P.alt(
         r.item_type,
         r.item_val,
         r.item_use // TODO other items: useffi
       ),
       (attrs, stmt) => {
         stmt.value.attrs = attrs;
         return stmt;
       }
    ),

  item_use: r => P.seqMap(
    r.pub,
    P.string("use").mark().skip(r.skip),
    r.id,
    P.seqMap(
        P.string("as").mark().skip(r.skip),
        r.sid,
        (kw, sid) => ({kw, sid})
      )
      .fallback({ kw: null, sid: null}),
    (pub, use_kw, id, as_stuff) => ({
      pub,
      use_kw,
      id,
      as_kw: as_stuff.kw,
      as_sid: as_stuff.sid
    })
  )
  .node("ItemUse"),

  item_type: r => P.seqMap(
      r.pub,
      P.string("type").mark().skip(r.skip),
      r.sid
        .skip(P.string("=")).skip(r.skip),
      r.type_def,
      (pub, type_kw, sid, def) => ({pub, type_kw, sid, def})
    )
    .node("ItemType"),

  type_def: r => P.alt(r.type_anon, r.type_adt, r.type_generic),

  type_generic: r => P.seqMap(
      r.sid.sepBy1(P.string(",").skip(r.skip))
        .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
        .skip(P.string("=>")).skip(r.skip),
      P.alt(r.type_anon, r.type_adt),
      (params, def) => ({params, def})
    ),

  type_adt: r => P.seqMap(
      P.string("|").skip(r.skip)
        .then(r.sid),
      P.alt(
          r.type_anon.sepBy1(P.string(",").skip(r.skip))
            .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
            .node("FieldsAnon"),
          P.seqMap(
              r.sid.skip(r.skip),
              P.string(":").skip(r.skip)
                .then(r.type_anon),
              (sid, type) => ({sid, type})
            )
            .sepBy1(P.string(",").skip(r.skip))
              .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
              .node("FieldsNamed")
        )
        .fallback({name: "FieldsNone"}),
      (sid, fields) => ({sid, fields})
    )
    .atLeast(1)
    .node("TypeDefADT"),

  type_anon: r => P.seqMap(
    r.l_type_anon,
    r.r_type_anon.many(),
    (left, rights) => rights.reduce((acc, elem) => elem(acc), left)
  ),

  l_type_anon: r => P.alt(
      r.type_primitive,
      r.type_id,
      r.type_fun,
      r.type_tuple,
      r.type_ptr,
      r.type_ptr_mut,
      r.type_many,
      r.type_many_mut,
      r.type_repeated, // TODO other anonymous types: generic applications, ...
    )
    .node("TypeDefAnon"),

  type_primitive: r => P.alt(
      P.string("U8"),
      P.string("U16"),
      P.string("U32"),
      P.string("U64"),
      P.string("U128"),
      P.string("Usize"),
      P.string("I8"),
      P.string("I16"),
      P.string("I32"),
      P.string("I64"),
      P.string("I128"),
      P.string("Isize"),
      P.string("F32"),
      P.string("F64"),
      P.string("Bool"),
      P.string("Void")
    )
    .desc("primitive type")
    .node("TypePrimitive")
    .skip(r.skip),

  type_id: r => r.id.node("TypeId"),

  type_tuple: r => r.type_anon.sepBy(P.string(",").skip(r.skip))
    .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
    .node("TypeTuple"),

  type_fun: r => P.seqMap(
      r.type_anon.sepBy(P.string(",").skip(r.skip))
      .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
      P.string("->")
      .skip(r.skip)
      .then(r.type_anon),
      (args, ret) => ({args, ret})
    )
    .node("TypeFun"),

  type_ptr: r => P.string("@").skip(r.skip)
    .then(r.type_anon)
    .node("TypePtr"),

  type_ptr_mut: r => P.string("~").skip(r.skip)
    .then(r.type_anon)
    .node("TypePtrMut"),

  type_many: r => r.type_anon.skip(r.skip)
    .wrap(P.string("@[").skip(r.skip), P.string("]").skip(r.skip))
    .node("TypeMany"),

  type_many_mut: r => r.type_anon.skip(r.skip)
    .wrap(P.string("~[").skip(r.skip), P.string("]").skip(r.skip))
    .node("TypeManyMut"),

  type_repeated: r => P.seqMap(
      P.string("(").skip(r.skip)
        .then(r.type_anon),
      P.string(";").skip(r.skip)
        .then(r.exp)
        .skip(r.skip)
        .skip(P.string(")")),
      (inner, num) => ({inner, num})
    )
    .node("TypeRepeated"),

  // The r_type_anon parsers don't return ast nodes directly, but rather closures
  // which take the left side as an arg and then return the ast node.
  r_type_anon: r => P.alt(
      r.r_type_app
    ),

  r_type_app: r => r.type_anon.sepBy1(P.string(",").skip(r.skip))
      .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
    .map(args => ({args}))
    .node("TypeApp")
    .skip(r.skip)
    .map(node => left => {
      node.value.generic_type = left;
      return node;
    }),

  item_val: r => P.seqMap(
      r.pub,
      P.string("val").mark().skip(r.skip),
      r.pattern_irref
        .skip(P.string("=")).skip(r.skip),
      P.alt(
          r.generic_fun_def,
          r.exp
        ),
      (pub, val_kw, pattern, def) => ({pub, val_kw, pattern, def})
    )
    .node("ItemVal"),

  generic_fun_def: r => P.seqMap(
      r.sid.sepBy1(P.string(",").skip(r.skip))
        .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
        .skip(P.string("=>")).skip(r.skip),
      r.l_exp_fun,
      (params, fun) => ({params, fun})
    ),

  pattern: r => P.alt(
    r.literal_bool,
    r.literal_float,
    r.literal_int,
    r.pattern_named,
    r.pattern_blank,
    r.pattern_adt_fields_anon,
    r.pattern_adt_fields_named,
    r.pattern_adt_no_fields,
    r.pattern_tuple,
    r.pattern_binding,
    r.pattern_ptr,
  ),

  pattern_blank: r => P.string("_")
    .skip(r.skip)
    .node("PatternBlank"),

  pattern_binding: r => P.seqMap(
      r.mut,
      r.sid,
      r.annotation,
      (mut, sid, annotation) => ({mut, sid, annotation})
    )
    .node("PatternBinding"),

  pattern_skip: r => P.string("..").skip(r.skip)
    .node("PatternSkip"),

  pattern_adt_no_fields: r => P.string("|").skip(r.skip)
    .then(r.id)
    .node("PatternAdtNoFields"),

  pattern_adt_fields_anon: r => P.string("|").skip(r.skip)
    .then(P.seqMap(
        r.id,
        P.alt(
            r.pattern_skip,
            r.pattern
          ).sepBy(P.string(",").skip(r.skip))
          .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
        (sid, fields) => ({sid, fields})
      ))
    .node("PatternAdtFieldsAnon"),

  pattern_adt_fields_named: r => P.string("|").skip(r.skip)
    .then(P.seqMap(
        r.id,
        P.alt(
            r.pattern_skip,
            P.seqMap(
                r.sid,
                P.string("=").skip(r.skip)
                  .then(r.pattern),
                (sid, pattern) => ({sid, pattern})
              )
          )
        .sepBy(P.string(",").skip(r.skip))
            .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
        (sid, fields) => ({sid, fields})
      ))
    .node("PatternAdtFieldsNamed"),

  pattern_tuple: r => P.alt(
        r.pattern_skip,
        r.pattern
      ).sepBy(P.string(",").skip(r.skip))
      .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
      .node("PatternTuple"),

  pattern_ptr: r => P.string("@").skip(r.skip)
    .then(r.pattern)
    .node("PatternPtr"),

  pattern_named: r => P.seqMap(
      r.pattern_binding
        .skip(P.string(":=").skip(r.skip)),
      r.pattern,
      (binding, inner) => ({binding, inner})
    )
    .node("PatternNamed"),

  pattern_irref: r => P.alt(
    r.pattern_named_irref,
    r.pattern_blank,
    r.pattern_binding,
    r.pattern_tuple_irref,
    r.pattern_ptr_irref,
  ), // TODO other irref patterns

  pattern_tuple_irref: r => P.alt(
      r.pattern_skip,
      r.pattern_irref
    ).sepBy(P.string(",").skip(r.skip))
      .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
      .node("PatternTuple"),

  pattern_ptr_irref: r => P.string("@").skip(r.skip)
    .then(r.pattern_irref)
    .node("PatternPtr"),

  pattern_named_irref: r => P.seqMap(
      r.pattern_binding
        .skip(P.string(":=").skip(r.skip)),
      r.pattern_irref,
      (binding, inner) => ({binding, inner})
    )
    .node("PatternNamed"),

  annotation: r => P.string(":")
    .skip(r.skip)
    .then(r.type_anon)
    .fallback(null)
    .skip(r.skip),

  exp: r => P.seqMap(
    r.l_exp,
    r.r_exp.many(),
    (left, rights) => rights.reduce((acc, elem) => elem(acc), left)
  ),

  l_exp: r => P.alt(
    r.literal_bool,
    r.literal_float,
    r.literal_int,
    r.l_exp_sizeof,
    r.l_exp_if,
    r.l_exp_while,
    r.l_exp_case,
    r.l_exp_loop,
    r.l_exp_id,
    r.l_exp_fun,
    r.l_exp_repeated,
    r.l_exp_tuple,
    r.block,
    r.l_exp_ptr,
    r.l_exp_ptr_mut,
    r.l_exp_many,
    r.l_exp_many_mut,
  ), // TODO all the expressions

  literal_bool: r => P.alt(
      P.string("true").result(true),
      P.string("false").result(false)
    )
    .node("ExpLiteralBool")
    .skip(r.skip),

  literal_int: r => P.seqMap(
      P.string("-").result(true).fallback(false),
      P.regex(/[0-9]+/).desc("integer literal"),
      (negative, chars) => ({negative, chars})
    )
    .node("ExpLiteralInt")
    .skip(r.skip),

  literal_float: r => P.seqMap(
      P.string("-").result(true).fallback(false),
      P.regex(/[0-9]+\.[0-9]+(?:E[+-]?[0-9]+)?/).desc("float literal"),
      (negative, chars) => ({negative})
    )
    .node("ExpLiteralFloat")
    .skip(r.skip),

  l_exp_id: r => r.id.node("ExpId"),

  l_exp_repeated: r => P.seqMap(
      P.string("(").skip(r.skip)
        .then(r.exp),
      P.string(";").skip(r.skip)
        .then(r.exp)
        .skip(r.skip)
        .skip(P.string(")")),
      (inner, num) => ({inner, num})
    )
    .node("ExpRepeated"),

  l_exp_tuple: r => r.exp.sepBy(P.string(",").skip(r.skip))
    .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
    .node("ExpTuple"),

  l_exp_fun: r => P.seqMap(
      r.pattern_irref.sepBy(P.string(",").skip(r.skip))
        .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
      P.string("->")
        .skip(r.skip)
        .then(r.type_anon)
        .fallback(null),
      r.block,
      (args, ret, body) => ({args, ret, body})
    )
    .node("ExpFun"),

  l_exp_sizeof: r => P.seqMap(
      P.string("sizeof").mark().skip(r.skip),
      r.exp
        .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
      (sizeof_kw, inner) => ({sizeof_kw, inner})
    )
    .node("ExpSizeof"),

  l_exp_if: r => P.seqMap(
      P.string("if").mark().skip(r.skip),
      r.exp,
      r.block,
      P.seqMap(
          P.string("else").mark().skip(r.skip),
          P.alt(
            r.block,
            r.l_exp_if.map(elseif => [elseif])
          ),
          (kw, block) => ({kw, block})
        )
        .fallback({ kw: null, block: null}),
      (if_kw, cond, if_block, else_stuff) => ({
        if_kw,
        cond,
        if_block,
        else_kw: else_stuff.kw,
        else_block: else_stuff.block
      })
    )
    .node("ExpIf"),

  l_exp_while: r => P.seqMap(
      P.string("while").mark().skip(r.skip),
      r.exp,
      r.block,
      (while_kw, cond, body) => ({
        while_kw,
        cond,
        body
      })
    )
    .node("ExpWhile"),

  l_exp_case: r => P.seqMap(
      P.string("case").mark().skip(r.skip),
      r.exp,
      P.seqMap(
          r.pattern.sepBy1(P.string("+").skip(r.skip)),
          r.block,
          (patterns, block) => ({patterns, block})
        )
        .atLeast(1)
        .wrap(P.string("{").skip(r.skip), P.string("}").skip(r.skip)),
      (case_kw, exp, cases) => ({
        case_kw,
        exp,
        cases
      })
    )
    .node("ExpCase"),

  l_exp_loop: r => P.seqMap(
      P.string("loop").mark().skip(r.skip),
      r.exp,
      P.seqMap(
          r.pattern.sepBy1(P.string("+").skip(r.skip)),
          r.block,
          (patterns, block) => ({patterns, block})
        )
        .atLeast(1)
        .wrap(P.string("{").skip(r.skip), P.string("}").skip(r.skip)),
      (loop_kw, exp, cases) => ({
        loop_kw,
        exp,
        cases
      })
    )
    .node("ExpLoop"),

  l_exp_ptr: r => P.string("@").skip(r.skip)
    .then(r.exp)
    .node("ExpPtr"),

  l_exp_ptr_mut: r => P.string("~").skip(r.skip)
    .then(r.exp)
    .node("ExpPtrMut"),

  l_exp_many: r => r.exp.skip(r.skip)
    .wrap(P.string("@[").skip(r.skip), P.string("]").skip(r.skip))
    .node("ExpMany"),

  l_exp_many_mut: r => r.exp.skip(r.skip)
    .wrap(P.string("~[").skip(r.skip), P.string("]").skip(r.skip))
    .node("ExpManyMut"),

  // The r_exp_xxx parsers don't return ast nodes directly, but rather closures
  // which take the left side as an arg and then return the ast node.
  r_exp: r => P.alt(
      r.r_exp_tuple_access,
      r.r_exp_struct_access,
      r.r_exp_fun_app_named,
      r.r_exp_fun_app,
      r.r_exp_land,
      r.r_exp_lor,
      r.r_exp_deref,
      r.r_exp_deref_mut,
      r.r_exp_index,
      r.r_exp_as,
    ),

  r_exp_tuple_access: r => P.string(".")
    .skip(r.skip)
    .then(P.regex(/[0-9]+/))
    .map(index => ({index}))
    .node("ExpTupleAccess")
    .skip(r.skip)
    .map(node => left => {
      node.value.tuple = left;
      return node;
    }),

  r_exp_struct_access: r => P.string(".")
    .skip(r.skip)
    .then(r.sid)
    .map(sid => ({sid}))
    .node("ExpStructAccess")
    .skip(r.skip)
    .map(node => left => {
      node.value.struct = left;
      return node;
    }),

  r_exp_fun_app: r => P.seqMap(
      r.type_anon.sepBy1(P.string(",").skip(r.skip))
        .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
        .fallback(null),
      r.exp.sepBy(P.string(",").skip(r.skip))
        .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
      (type_args, args) => ({type_args, args})
    )
    .node("ExpFunApp")
    .map(node => left => {
      node.value.callee = left;
      return node;
    }),

  r_exp_fun_app_named: r => P.seqMap(
      r.sid.skip(r.skip),
      P.string("=").skip(r.skip)
        .then(r.exp),
      (sid, exp) => ({sid, exp})
    ).sepBy(P.string(",").skip(r.skip))
      .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
      .map(args => ({args}))
      .node("ExpFunAppNamed")
      .map(node => left => {
        node.value.callee = left;
        return node;
      }),

  r_exp_land: r => P.string("&&").skip(r.skip)
    .then(r.exp)
    .map(rhs => ({rhs}))
    .node("ExpLand")
    .map(node => left => {
      node.value.lhs = left;
      return node;
    }),

  r_exp_lor: r => P.string("||").skip(r.skip)
    .then(r.exp)
    .map(rhs => ({rhs}))
    .node("ExpLor")
    .map(node => left => {
      node.value.lhs = left;
      return node;
    }),

  r_exp_deref: r => P.string("@").skip(r.skip)
    .node("ExpDeref")
    .map(node => left => {
      node.value = left;
      return node;
    }),

  r_exp_deref_mut: r => P.string("~").skip(r.skip)
    .node("ExpDerefMut")
    .map(node => left => {
      node.value = left;
      return node;
    }),

  r_exp_index: r => r.exp.skip(r.skip)
    .wrap(P.string("[").skip(r.skip), P.string("]").skip(r.skip))
    .map(index => ({index}))
    .node("ExpIndex")
    .map(node => left => {
      node.value.many = left;
      return node;
    }),

  r_exp_as: r => P.seqMap(
    P.string("as").mark().skip(r.skip),
    r.type_anon,
    (as_kw, type) => ({as_kw, type})
  )
  .node("ExpAs")
  .map(node => left => {
    node.value.exp = left;
    return node;
  }),

  block: r => r.stmt.sepBy(P.string(";").skip(r.skip))
    .wrap(P.string("{").skip(r.skip), P.string("}").skip(r.skip)),

  stmt: r => P.seqMap(
      r.attr.many(),
      P.alt(
         r.stmt_halt,
         r.stmt_unreachable,
         r.stmt_val,
         r.stmt_assign,
         r.stmt_break,
         r.stmt_return,
         r.stmt_label,
         r.stmt_goto,
         r.exp
       ),
       (attrs, stmt) => {
         stmt.value.attrs = attrs;
         return stmt;
       }
    ),

  stmt_halt: r => P.string("halt")
    .skip(r.skip)
    .node("StmtHalt"),

  stmt_unreachable: r => P.string("unreachable")
    .skip(r.skip)
    .node("StmtUnreachable"),

  stmt_val: r => P.seqMap(
      P.string("val").mark().skip(r.skip),
      r.pattern_irref,
      P.string("=").skip(r.skip)
        .then(r.exp)
        .fallback(null),
      (val_kw, pattern, def) => ({val_kw, pattern, def})
    )
    .node("StmtVal"),

  stmt_assign: r => P.seqMap(
      r.lvalue
        .skip(P.string("=")).skip(r.skip),
      r.exp,
      (lhs, rhs) => ({lhs, rhs})
    )
    .node("StmtAssign"),

  stmt_break: r => P.seqMap(
      P.string("break").mark().skip(r.skip),
      r.exp.fallback(null),
      (break_kw, exp) => ({break_kw, exp})
    )
    .node("StmtBreak"),

  stmt_return: r => P.seqMap(
      P.string("return").mark().skip(r.skip),
      r.exp.fallback(null),
      (break_kw, exp) => ({break_kw, exp})
    )
    .node("StmtReturn"),

  stmt_goto: r => P.seqMap(
      P.string("goto").mark().skip(r.skip),
      P.regex(/[_a-zA-Z][_a-zA-Z0-9]{0,127}/)
        .desc("label")
        .skip(r.skip),
      (goto_kw, label) => ({goto_kw, label})
    )
    .node("StmtGoto"),

  stmt_label: r => P.seqMap(
      P.string("label").mark().skip(r.skip),
      P.regex(/[_a-zA-Z][_a-zA-Z0-9]{0,127}/)
        .desc("label")
        .skip(r.skip),
      (label_kw, label) => ({label_kw, label})
    )
    .node("StmtLabel"),

  lvalue: r => P.seqMap(
    r.l_lvalue,
    r.r_lvalue.many(),
    (left, rights) => rights.reduce((acc, elem) => elem(acc), left)
  ),

  l_lvalue: r => P.alt(
      r.l_exp_id,
      r.lvalue_parens,
    ),

  // The r_exp_xxx parsers don't return ast nodes directly, but rather closures
  // which take the left side as an arg and then return the ast node.
  r_lvalue: r => P.alt(
      r.r_exp_tuple_access,
      r.r_exp_deref_mut,
      r.r_exp_index,
    ),

  lvalue_parens: r => r.lvalue
    .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
});
