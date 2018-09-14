let P = require("parsimmon");

module.exports = ast => {
    ast.items_public = {};
    ast.items_private = {};
    return P.createLanguage({
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
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     id: r => r.sid.sepBy1(P.string("::").skip(r.skip))
       .node("Id")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     attr: r => P.alt(r.attr_cc, r.attr_test_gen, r.attr_test, r.attr_repr)
       .wrap(P.string("#["), P.string("]"))
       .node("Attr")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     attr_cc: r => P.regex(/\w*/)
       .wrap(P.string("cc("), P.string(")"))
       .node("AttrCc")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     attr_test: r => P.alt(
         P.string("test_pure").result(true),
         P.string("test").result(false)
       )
       .node("AttrTest")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     attr_test_gen: r => P.string("test_gen")
       .node("AttrTestGen")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     attr_repr: r => P.string("repr(C)")
       .node("AttrRepr")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     pub: r => P.string("pub").result(true).mark().fallback(false)
       .skip(r.skip),

     mut: r => P.string("mut").result(true).mark().fallback(false)
       .skip(r.skip),

     item: r => P.seqMap(
         r.attr.many(),
         P.alt(
            r.item_type,
            r.item_val,
            r.item_use,
            r.item_ffi_include,
            r.item_ffi_val
          ),
          (attrs, item) => {
            item.value.attrs = attrs;
            return item;
          }
       ),

     item_ffi_include: r => P.seqMap(
         P.string("ffi").mark().skip(r.skip),
         P.string("include").mark().skip(r.skip),
         P.alt(
           P.regex(/[a-zA-Z0-9_\.]+/)
             .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
             .map(include => ({include, relative: false})),
           P.regex(/[a-zA-Z0-9_\.]+/)
             .wrap(P.string("\"").skip(r.skip), P.string("\"").skip(r.skip))
             .map(include => ({include, relative: true})),
         ),
         (ffi_kw, include_kw, inc) => ({ffi_kw, include_kw, include: inc.include, relative: inc.relative})
       )
       .node("ItemFfiInclude")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
     .node("ItemUse")
     .map(node => {
       node.ast = ast;

       if (node.value.pub) {
           ast.items_public[
               node.value.as_sid ?
                    node.value.as_sid :
                    node.value.id.value[node.value.id.value.length - 1]
            ] = node;
       } else {
           ast.items_private[
               node.value.as_sid ?
                    node.value.as_sid :
                    node.value.id.value[node.value.id.value.length - 1]
            ] = node;
       }

       return node;
     }),

     item_type: r => P.seqMap(
         r.pub,
         P.string("type").mark().skip(r.skip),
         r.sid
           .skip(P.string("=")).skip(r.skip),
         r.type_def,
         (pub, type_kw, sid, def) => ({pub, type_kw, sid, def})
       )
       .node("ItemType")
       .map(node => {
         node.ast = ast;

         if (node.value.pub) {
             ast.items_public[node.value.sid] = node;
         } else {
            ast.items_private[node.value.sid] = node;
         }

         return node;
       }),

     type_def: r => P.alt(r.type_def_adt, r.type_def_anon, r.type_def_generic),

     type_def_anon: r => r.type_anon.node("TypeDefAnon"),

     type_def_generic: r => P.seqMap(
         r.sid.sepBy1(P.string(",").skip(r.skip))
           .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
           .skip(P.string("=>")).skip(r.skip),
         P.alt(r.type_def_anon, r.type_def_adt),
         (params, def) => ({params, def})
       )
       .node("TypeDefGeneric")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_def_adt: r => P.seqMap(
         r.pub,
         P.string("|").skip(r.skip)
           .then(r.sid),
         P.alt(
             r.type_anon.sepBy1(P.string(",").skip(r.skip))
               .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
               .node("FieldsAnon")
               .map(node => {
                 node.ast = ast;
                 return node;
               }),
             P.seqMap(
                 r.sid.skip(r.skip),
                 P.string(":").skip(r.skip)
                   .then(r.type_anon),
                 (sid, type) => ({sid, type})
               )
               .sepBy1(P.string(",").skip(r.skip))
                 .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
                 .node("FieldsNamed")
                 .map(node => {
                   node.ast = ast;
                   return node;
                 })
           )
           .fallback({name: "FieldsNone", ast}),
         (non_opaque, sid, fields) => ({non_opaque, sid, fields})
       )
       .atLeast(1)
       .node("TypeDefADT")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       ),

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
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     type_id: r => r.id.node("TypeId")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_tuple: r => r.type_anon.sepBy(P.string(",").skip(r.skip))
       .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
       .node("TypeTuple")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_fun: r => P.seqMap(
         r.type_anon.sepBy(P.string(",").skip(r.skip))
         .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
         P.string("->")
         .skip(r.skip)
         .then(r.type_anon),
         (args, ret) => ({args, ret})
       )
       .node("TypeFun")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_ptr: r => P.string("@").skip(r.skip)
       .then(r.type_anon)
       .node("TypePtr")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_ptr_mut: r => P.string("~").skip(r.skip)
       .then(r.type_anon)
       .node("TypePtrMut")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_many: r => r.type_anon.skip(r.skip)
       .wrap(P.string("@[").skip(r.skip), P.string("]").skip(r.skip))
       .node("TypeMany")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_many_mut: r => r.type_anon.skip(r.skip)
       .wrap(P.string("~[").skip(r.skip), P.string("]").skip(r.skip))
       .node("TypeManyMut")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     type_repeated: r => P.seqMap(
         P.string("(").skip(r.skip)
           .then(r.type_anon),
         P.string(";").skip(r.skip)
           .then(r.exp)
           .skip(r.skip)
           .skip(P.string(")")),
         (inner, num) => ({inner, num})
       )
       .node("TypeRepeated")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     // The r_type_anon parsers don't return ast nodes directly, but rather closures
     // which take the left side as an arg and then return the ast node.
     r_type_anon: r => P.alt(
         r.r_type_app
       ),

     r_type_app: r => r.type_anon.sepBy1(P.string(",").skip(r.skip))
         .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
       .map(args => ({args}))
       .node("TypeApp")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip)
       .map(node => left => {
         node.value.generic_type = left;
         return node;
       }),

     item_ffi_val: r => P.seqMap(
         r.pub,
         P.string("ffi").mark().skip(r.skip),
         P.string("val").mark().skip(r.skip),
         r.mut,
         r.sid
           .skip(P.string(":")).skip(r.skip),
         r.type_anon,
         (pub, ffi_kw, val_kw, mutable, sid, type) => ({pub, ffi_kw, val_kw, mutable, sid, type})
       )
       .node("ItemFfiVal")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     item_val: r => P.seqMap(
         r.pub,
         P.string("val").mark().skip(r.skip),
         r.pattern_irref
           .skip(P.string("=")).skip(r.skip),
         P.alt(
             r.generic_fun_def,
             r.exp_def,
           ),
         (pub, val_kw, pattern, def) => ({pub, val_kw, pattern, def})
       )
       .node("ItemVal")
       .map(node => {
         node.ast = ast;

         console.log(node);
         /* TODO XXX recursively walk all patterns */
         // TODO nah, rather disallow top-level, non-binding patterns
         if (node.value.pub) {
             // TODO
         } else {
            // TODO
         }

         return node;
       }),

     exp_def: r => r.exp.node("ExpDefAnon")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     generic_fun_def: r => P.seqMap(
         r.sid.sepBy1(P.string(",").skip(r.skip))
           .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
           .skip(P.string("=>")).skip(r.skip),
         r.l_exp_fun,
         (params, fun) => ({params, fun})
       )
       .node("ExpDefGenericFun")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("PatternBlank")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_binding: r => P.seqMap(
         r.mut,
         r.sid,
         r.annotation,
         (mut, sid, annotation) => ({mut, sid, annotation})
       )
       .node("PatternBinding")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_skip: r => P.string("..").skip(r.skip)
       .node("PatternSkip")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_adt_no_fields: r => P.string("|").skip(r.skip)
       .then(r.id)
       .node("PatternAdtNoFields")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("PatternAdtFieldsAnon")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("PatternAdtFieldsNamed")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_tuple: r => P.alt(
           r.pattern_skip,
           r.pattern
         ).sepBy(P.string(",").skip(r.skip))
         .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
         .node("PatternTuple")
         .map(node => {
           node.ast = ast;
           return node;
         }),

     pattern_ptr: r => P.string("@").skip(r.skip)
       .then(r.pattern)
       .node("PatternPtr")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_named: r => P.seqMap(
         r.pattern_binding
           .skip(P.string(":=").skip(r.skip)),
         r.pattern,
         (binding, inner) => ({binding, inner})
       )
       .node("PatternNamed")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_irref: r => P.alt(
       r.pattern_named_irref,
       r.pattern_blank,
       r.pattern_binding,
       r.pattern_tuple_irref,
       r.pattern_ptr_irref,
     ),

     pattern_tuple_irref: r => P.alt(
         r.pattern_skip,
         r.pattern_irref
       ).sepBy(P.string(",").skip(r.skip))
         .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
         .node("PatternTuple")
         .map(node => {
           node.ast = ast;
           return node;
         }),

     pattern_ptr_irref: r => P.string("@").skip(r.skip)
       .then(r.pattern_irref)
       .node("PatternPtr")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     pattern_named_irref: r => P.seqMap(
         r.pattern_binding
           .skip(P.string(":=").skip(r.skip)),
         r.pattern_irref,
         (binding, inner) => ({binding, inner})
       )
       .node("PatternNamed")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       r.block.node("ExpBlock")
         .map(node => {
           node.ast = ast;
           return node;
         }),
       r.l_exp_ptr,
       r.l_exp_ptr_mut,
       r.l_exp_many,
       r.l_exp_many_mut,
     ),

     literal_bool: r => P.alt(
         P.string("true").result(true),
         P.string("false").result(false)
       )
       .node("ExpLiteralBool")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     literal_int: r => P.seqMap(
         P.string("-").result(true).fallback(false),
         P.regex(/[0-9]+/).desc("integer literal"),
         (negative, chars) => ({negative, chars})
       )
       .node("ExpLiteralInt")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip),

     literal_float: r => P.seqMap(
         P.string("-").result(true).fallback(false),
         P.regex(/[0-9]+\.[0-9]+(?:E[+-]?[0-9]+)?/).desc("float literal"),
         (negative, chars) => ({negative})
       )
       .node("ExpLiteralFloat")
       .map(node => {
         node.ast = ast;
         return node;
       })
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
       .node("ExpRepeated")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_tuple: r => r.exp.sepBy(P.string(",").skip(r.skip))
       .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
       .node("ExpTuple")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("ExpFun")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_sizeof: r => P.seqMap(
         P.string("sizeof").mark().skip(r.skip),
         r.type_anon
           .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
         (sizeof_kw, inner) => ({sizeof_kw, inner})
       )
       .node("ExpSizeof")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_if: r => P.seqMap(
         P.string("if").mark().skip(r.skip),
         r.exp,
         r.block,
         P.seqMap(
             P.string("else").mark().skip(r.skip),
             P.alt(
               r.block,
               r.l_exp_if.node("StmtExp").map(elseif => {
                 elseif.ast = ast;
                 elseif.value.attrs = [];
                 return [elseif];
               })
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
       .node("ExpIf")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("ExpWhile")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("ExpCase")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .node("ExpLoop")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_ptr: r => P.string("@").skip(r.skip)
       .then(r.exp)
       .node("ExpPtr")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_ptr_mut: r => P.string("~").skip(r.skip)
       .then(r.exp)
       .node("ExpPtrMut")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_many: r => r.exp.skip(r.skip)
       .wrap(P.string("@[").skip(r.skip), P.string("]").skip(r.skip))
       .node("ExpMany")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     l_exp_many_mut: r => r.exp.skip(r.skip)
       .wrap(P.string("~[").skip(r.skip), P.string("]").skip(r.skip))
       .node("ExpManyMut")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
       .map(node => {
         node.ast = ast;
         return node;
       })
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
       .map(node => {
         node.ast = ast;
         return node;
       })
       .skip(r.skip)
       .map(node => left => {
         node.value.struct = left;
         return node;
       }),

     r_exp_fun_app: r => P.seqMap(
         r.type_anon.sepBy1(P.string(",").skip(r.skip))
           .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
           .fallback([]),
         r.exp.sepBy(P.string(",").skip(r.skip))
           .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
         (type_args, args) => ({type_args, args})
       )
       .node("ExpFunApp")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .map(node => left => {
         node.value.callee = left;
         return node;
       }),

     r_exp_fun_app_named: r => P.seqMap(
         r.type_anon.sepBy1(P.string(",").skip(r.skip))
           .wrap(P.string("<").skip(r.skip), P.string(">").skip(r.skip))
           .fallback([]),
         P.seqMap(
            r.sid.skip(r.skip),
            P.string("=").skip(r.skip)
              .then(r.exp),
            (sid, exp) => ({sid, exp})
          ).sepBy(P.string(",").skip(r.skip))
            .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip)),
         (type_args, args) => ({type_args, args})
       )
       .node("ExpFunAppNamed")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .map(node => left => {
         node.value.callee = left;
         return node;
       }),

     r_exp_land: r => P.string("&&").skip(r.skip)
       .then(r.exp)
       .map(rhs => ({rhs}))
       .node("ExpLand")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .map(node => left => {
         node.value.lhs = left;
         return node;
       }),

     r_exp_lor: r => P.string("||").skip(r.skip)
       .then(r.exp)
       .map(rhs => ({rhs}))
       .node("ExpLor")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .map(node => left => {
         node.value.lhs = left;
         return node;
       }),

     r_exp_deref: r => P.string("@").skip(r.skip)
       .node("ExpDeref")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .map(node => left => {
         node.value = left;
         return node;
       }),

     r_exp_deref_mut: r => P.string("~").skip(r.skip)
       .node("ExpDerefMut")
       .map(node => {
         node.ast = ast;
         return node;
       })
       .map(node => left => {
         node.value = left;
         return node;
       }),

     r_exp_index: r => r.exp.skip(r.skip)
       .wrap(P.string("[").skip(r.skip), P.string("]").skip(r.skip))
       .map(index => ({index}))
       .node("ExpIndex")
       .map(node => {
         node.ast = ast;
         return node;
       })
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
     .map(node => {
       node.ast = ast;
       return node;
     })
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
            r.exp.node("StmtExp")
              .map(node => {
                node.ast = ast;
                return node;
              }),
          ),
          (attrs, stmt) => {
            stmt.value.attrs = attrs;
            return stmt;
          }
       ),

     stmt_halt: r => P.string("halt")
       .skip(r.skip)
       .result({})
       .node("StmtHalt")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_unreachable: r => P.string("unreachable")
       .skip(r.skip)
       .result({})
       .node("StmtUnreachable")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_val: r => P.seqMap(
         P.string("val").mark().skip(r.skip),
         r.pattern_irref,
         P.string("=").skip(r.skip)
           .then(r.exp)
           .fallback(null),
         (val_kw, pattern, def) => ({val_kw, pattern, def})
       )
       .node("StmtVal")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_assign: r => P.seqMap(
         r.lvalue
           .skip(P.string("=")).skip(r.skip),
         r.exp,
         (lhs, rhs) => ({lhs, rhs})
       )
       .node("StmtAssign")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_break: r => P.seqMap(
         P.string("break").mark().skip(r.skip),
         r.exp.fallback(null),
         (break_kw, exp) => ({break_kw, exp})
       )
       .node("StmtBreak")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_return: r => P.seqMap(
         P.string("return").mark().skip(r.skip),
         r.exp.fallback(null),
         (break_kw, exp) => ({break_kw, exp})
       )
       .node("StmtReturn")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_goto: r => P.seqMap(
         P.string("goto").mark().skip(r.skip),
         P.regex(/[_a-zA-Z][_a-zA-Z0-9]{0,127}/)
           .desc("label")
           .skip(r.skip),
         (goto_kw, label) => ({goto_kw, label})
       )
       .node("StmtGoto")
       .map(node => {
         node.ast = ast;
         return node;
       }),

     stmt_label: r => P.seqMap(
         P.string("label").mark().skip(r.skip),
         P.regex(/[_a-zA-Z][_a-zA-Z0-9]{0,127}/)
           .desc("label")
           .skip(r.skip),
         (label_kw, label) => ({label_kw, label})
       )
       .node("StmtLabel")
       .map(node => {
         node.ast = ast;
         return node;
       }),

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
};
