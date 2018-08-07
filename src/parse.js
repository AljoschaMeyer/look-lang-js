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

  pub: r => P.string("pub").result(true).mark().atMost(1)
    .map(pubs => {
      if (pubs.length == 0) {
        return null;
      } else {
        return pubs[0];
      }
    })
    .skip(r.skip),

  mut: r => P.string("mut").result(true).mark().atMost(1)
    .map(muts => {
      if (muts.length == 0) {
        return null;
      } else {
        return muts[0];
      }
    })
    .skip(r.skip),

  item: r => P.alt(r.item_type, r.item_val), // TODO other items: val, use, ffi

  item_type: r => P.seqMap(
      r.attr.many(),
      r.pub,
      P.string("type").mark().skip(r.skip),
      r.sid
        .skip(P.string("=")).skip(r.skip),
      r.type_def,
      (attrs, pub, type_kw, sid, def) => ({attrs, pub, type_kw, sid, def})
    )
    .node("ItemType"),

  type_def: r => P.alt(r.type_anon), // TODO other type defs: generics and adts

  type_anon: r => P.alt(
      r.type_primitive,
      r.type_id,
      r.type_tuple, // XXX funs must come before this // TODO other anonymous types: funs, pointers, generic applications, ...
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
    .node("TypePrimitive")
    .skip(r.skip),
    type_id: r => r.id.node("TypeId"),
  type_tuple: r => r.type_anon.sepBy(P.string(",").skip(r.skip))
    .wrap(P.string("(").skip(r.skip), P.string(")").skip(r.skip))
    .node("TypeTuple"),

  item_val: r => P.seqMap(
      r.attr.many(),
      r.pub,
      P.string("val").mark().skip(r.skip),
      r.pattern_irref
        .skip(P.string("=")).skip(r.skip),
      r.exp,
      (attrs, pub, val_kw, mut, sid, def) => ({attrs, pub, val_kw, mut, sid, def})
    )
    .node("ItemVal"),

    pattern_irref: r => P.alt(
      r.pattern_blank,
      r.pattern_binding
    ), // TODO other irref patterns
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

    annotation: r => P.string(":")
      .skip(r.skip)
      .then(r.type_anon)
      .atMost(1)
      .map(annos => {
        if (annos.length == 0) {
          return null;
        } else {
          return annos[0];
        }
      })
      .skip(r.skip),

    exp: r => P.alt(
      r.literal_bool
    ), // TODO all the expressions

    literal_bool: r => P.alt(
        P.string("true").result(true),
        P.string("false").result(false)
      )
      .node("ExpLiteralBool")
      .skip(r.skip)
});
