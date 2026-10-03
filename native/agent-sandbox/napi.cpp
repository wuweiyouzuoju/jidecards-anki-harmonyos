// SPDX-License-Identifier: AGPL-3.0-or-later
#include "napi/native_api.h"
#include "sandbox.h"
#include <cmath>
#include <memory>
#include <string>

namespace {
struct Call {
    uint64_t id = 0;
    napi_async_work work = nullptr;
    napi_deferred deferred = nullptr;
    char *output = nullptr;
    ~Call() { sandbox_string_free(output); sandbox_release(id); }
};
bool ReadString(napi_env env, napi_value value, size_t limit, std::string &out) {
    size_t len = 0;
    if (napi_get_value_string_utf8(env, value, nullptr, 0, &len) != napi_ok || len > limit) return false;
    out.resize(len + 1);
    if (napi_get_value_string_utf8(env, value, out.data(), out.size(), &len) != napi_ok) return false;
    out.resize(len);
    return true;
}
void Execute(napi_env, void *data) {
    auto *call = static_cast<Call *>(data);
    call->output = sandbox_execute(call->id);
}
void Complete(napi_env env, napi_status status, void *data) {
    std::unique_ptr<Call> call(static_cast<Call *>(data));
    // Settling a promise may immediately resume ArkTS and start the next job.
    sandbox_release(call->id);
    call->id = 0;
    napi_value result = nullptr;
    if (status == napi_ok && call->output != nullptr &&
        napi_create_string_utf8(env, call->output, NAPI_AUTO_LENGTH, &result) == napi_ok) {
        napi_resolve_deferred(env, call->deferred, result);
    } else {
        napi_value message = nullptr, error = nullptr;
        napi_create_string_utf8(env, "sandbox_internal_error", NAPI_AUTO_LENGTH, &message);
        napi_create_error(env, nullptr, message, &error);
        napi_reject_deferred(env, call->deferred, error);
    }
    napi_delete_async_work(env, call->work);
}
napi_value Start(napi_env env, napi_callback_info info) {
    try {
        size_t count = 2;
        napi_value args[2] = {nullptr};
        std::string source, input;
        if (napi_get_cb_info(env, info, &count, args, nullptr, nullptr) != napi_ok || count != 2 ||
            !ReadString(env, args[0], 65500, source) || !ReadString(env, args[1], 131072, input)) {
            napi_throw_error(env, nullptr, "sandbox_input_limit"); return nullptr;
        }
        auto call = std::make_unique<Call>();
        call->id = sandbox_create(reinterpret_cast<const uint8_t *>(source.data()), source.size(),
            reinterpret_cast<const uint8_t *>(input.data()), input.size());
        if (call->id == 0) { napi_throw_error(env, nullptr, "sandbox_busy"); return nullptr; }
        napi_value promise = nullptr, name = nullptr, result = nullptr, id = nullptr;
        if (napi_create_object(env, &result) != napi_ok ||
            napi_create_double(env, static_cast<double>(call->id), &id) != napi_ok ||
            napi_create_promise(env, &call->deferred, &promise) != napi_ok ||
            napi_set_named_property(env, result, "id", id) != napi_ok ||
            napi_set_named_property(env, result, "result", promise) != napi_ok ||
            napi_create_string_utf8(env, "jidecardsSandbox", NAPI_AUTO_LENGTH, &name) != napi_ok ||
            napi_create_async_work(env, nullptr, name, Execute, Complete, call.get(), &call->work) != napi_ok ||
            napi_queue_async_work(env, call->work) != napi_ok) {
            if (call->work != nullptr) napi_delete_async_work(env, call->work);
            napi_throw_error(env, nullptr, "sandbox_queue_failed"); return nullptr;
        }
        call.release();
        return result;
    } catch (...) { napi_throw_error(env, nullptr, "sandbox_internal_error"); return nullptr; }
}
napi_value Cancel(napi_env env, napi_callback_info info) {
    size_t count = 1; napi_value arg = nullptr, result = nullptr; double id = 0;
    if (napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr) != napi_ok || count != 1 ||
        napi_get_value_double(env, arg, &id) != napi_ok || !std::isfinite(id) || id < 1 || id > 9007199254740991.0 || std::floor(id) != id) {
        napi_throw_type_error(env, nullptr, "sandbox_invalid_handle"); return nullptr;
    }
    sandbox_cancel(static_cast<uint64_t>(id));
    napi_get_undefined(env, &result); return result;
}
napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor properties[] = {
        {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"cancel", nullptr, Cancel, nullptr, nullptr, nullptr, napi_default, nullptr}
    };
    napi_define_properties(env, exports, 2, properties); return exports;
}
}
static napi_module module = {1, 0, nullptr, Init, "agent_sandbox", nullptr, {nullptr}};
extern "C" __attribute__((constructor)) void RegisterAgentSandbox() { napi_module_register(&module); }
