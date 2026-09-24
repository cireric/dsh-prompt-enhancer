// src/index.ts
var name = "prompt-enhancer";
var inject = [];
function apply(ctx) {
  ctx.effect(() => {
    if (false) {
      console.log("[prompt-enhancer] host loaded v0.1.0");
    }
    return () => {
      if (false) console.log("[prompt-enhancer] host unloaded");
    };
  }, "prompt-enhancer: lifecycle");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
