// SPDX-License-Identifier: AGPL-3.0-or-later
#include "quickjs.h"
#include <stdint.h>
#include <string.h>

#define EXPORT(name) __attribute__((export_name(name)))
static char source[65537];
static char input[131073];
static char output[65536];
static uint32_t output_length;

EXPORT("source_ptr") char *source_ptr(void) { return source; }
EXPORT("input_ptr") char *input_ptr(void) { return input; }
EXPORT("output_ptr") char *output_ptr(void) { return output; }
EXPORT("output_len") uint32_t output_len(void) { return output_length; }

// The host drops the entire Wasm instance after this one call, including on traps.
// No libc modules, module loader, bytecode loader or host JS functions are installed.
EXPORT("run") int run(uint32_t source_length, uint32_t input_length) {
    if (source_length >= sizeof(source) || input_length >= sizeof(input)) return 1;
    source[source_length] = 0;
    input[input_length] = 0;
    JSRuntime *rt = JS_NewRuntime();
    if (!rt) return 2;
    JS_SetMemoryLimit(rt, 16 * 1024 * 1024);
    JSContext *ctx = JS_NewContext(rt);
    if (!ctx) return 2;
    JSValue data = JS_ParseJSON(ctx, input, input_length, "input.json");
    if (JS_IsException(data)) return 3;
    const char *bootstrap =
        "(function(value) {"
        " const freeze = (v) => {"
        "  if (v !== null && typeof v === 'object') {"
        "   for (const k of Object.keys(v)) freeze(v[k]); Object.freeze(v);"
        "  } return v;"
        " }; return freeze(value);"
        "})";
    JSValue freeze = JS_Eval(ctx, bootstrap, strlen(bootstrap), "freeze.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(freeze)) return 2;
    JSValue frozen = JS_Call(ctx, freeze, JS_UNDEFINED, 1, &data);
    if (JS_IsException(frozen)) return 3;
    JSValue fn = JS_Eval(ctx, source, source_length, "agent.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(fn) || !JS_IsFunction(ctx, fn)) return 4;
    JSValue result = JS_Call(ctx, fn, JS_UNDEFINED, 1, &frozen);
    if (JS_IsException(result)) return 4;
    if (JS_IsPromise(result) || JS_IsUndefined(result)) return 5;
    JSValue json = JS_JSONStringify(ctx, result, JS_UNDEFINED, JS_UNDEFINED);
    if (JS_IsException(json) || JS_IsUndefined(json)) return 5;
    size_t length = 0;
    const char *text = JS_ToCStringLen(ctx, &length, json);
    if (!text) return 5;
    if (length > sizeof(output)) return 6;
    memcpy(output, text, length);
    output_length = (uint32_t)length;
    return 0;
}
