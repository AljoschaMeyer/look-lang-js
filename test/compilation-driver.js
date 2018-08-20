let driver = require("../src/compilation-driver")({
  base: "guide/src/lib.oo",
  deps: true,
  features: {}
});

driver.analyze();
