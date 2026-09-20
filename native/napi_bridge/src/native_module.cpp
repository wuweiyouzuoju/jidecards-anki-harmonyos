// SPDX-License-Identifier: AGPL-3.0-or-later
#include "napi/native_api.h"
#include "rsharmony.h"

#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

struct ByteView {
    uint8_t *data = nullptr;
    size_t size = 0;
};

struct AsyncCall {
    napi_async_work work = nullptr;
    napi_deferred deferred = nullptr;
    uint32_t handle = 0;
    uint32_t service = 0;
    uint32_t method = 0;
    std::vector<uint8_t> input;
    std::vector<uint8_t> output;
    std::vector<uint8_t> error;
    int32_t status = ANKI_STATUS_NATIVE_FATAL;
};

bool ReadUint8Array(napi_env env, napi_value value, ByteView &view)
{
    bool isTypedArray = false;
    if (napi_is_typedarray(env, value, &isTypedArray) != napi_ok || !isTypedArray) {
        napi_throw_type_error(env, nullptr, "expected Uint8Array");
        return false;
    }

    napi_typedarray_type type;
    size_t length = 0;
    void *data = nullptr;
    napi_value arrayBuffer;
    size_t byteOffset = 0;
    if (napi_get_typedarray_info(env, value, &type, &length, &data, &arrayBuffer,
        &byteOffset) != napi_ok || type != napi_uint8_array) {
        napi_throw_type_error(env, nullptr, "expected Uint8Array");
        return false;
    }
    view.data = static_cast<uint8_t *>(data);
    view.size = length;
    return true;
}

bool ReadUint32(napi_env env, napi_value value, uint32_t &result)
{
    if (napi_get_value_uint32(env, value, &result) != napi_ok) {
        napi_throw_type_error(env, nullptr, "expected unsigned 32-bit integer");
        return false;
    }
    return true;
}

std::vector<uint8_t> CopyAndFree(AnkiBuffer buffer)
{
    std::vector<uint8_t> bytes;
    if (buffer.ptr != nullptr && buffer.len > 0) {
        bytes.assign(buffer.ptr, buffer.ptr + buffer.len);
    }
    anki_buffer_free(buffer);
    return bytes;
}

napi_value CreateUint8Array(napi_env env, const std::vector<uint8_t> &bytes)
{
    void *destination = nullptr;
    napi_value arrayBuffer = nullptr;
    napi_value typedArray = nullptr;
    if (napi_create_arraybuffer(env, bytes.size(), &destination, &arrayBuffer) != napi_ok) {
        return nullptr;
    }
    if (!bytes.empty()) {
        std::memcpy(destination, bytes.data(), bytes.size());
    }
    if (napi_create_typedarray(env, napi_uint8_array, bytes.size(), arrayBuffer, 0,
        &typedArray) != napi_ok) {
        return nullptr;
    }
    return typedArray;
}

std::string SafeMessage(int32_t status, const std::vector<uint8_t> &details)
{
    if (status != ANKI_STATUS_BACKEND_ERROR && !details.empty()) {
        return std::string(details.begin(), details.end());
    }
    switch (status) {
        case ANKI_STATUS_INVALID_ARGUMENT:
            return "native call received invalid input";
        case ANKI_STATUS_HANDLE_NOT_FOUND:
            return "backend handle not found";
        case ANKI_STATUS_BACKEND_ERROR:
            return "Anki backend rejected the request";
        default:
            return "unrecoverable native backend error";
    }
}

napi_value CreateNativeError(napi_env env, int32_t status,
    const std::vector<uint8_t> &details)
{
    napi_value message = nullptr;
    napi_value error = nullptr;
    const std::string safeMessage = SafeMessage(status, details);
    napi_create_string_utf8(env, safeMessage.c_str(), safeMessage.size(), &message);
    napi_create_error(env, nullptr, message, &error);

    napi_value statusValue = nullptr;
    napi_create_int32(env, status, &statusValue);
    napi_set_named_property(env, error, "nativeStatus", statusValue);

    napi_value detailValue = CreateUint8Array(env, details);
    if (detailValue != nullptr) {
        napi_set_named_property(env, error, "details", detailValue);
    }
    return error;
}

napi_value OpenBackend(napi_env env, napi_callback_info info)
{
    size_t argc = 1;
    napi_value argv[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc != 1) {
        napi_throw_type_error(env, nullptr, "openBackend expects one Uint8Array");
        return nullptr;
    }

    ByteView init;
    if (!ReadUint8Array(env, argv[0], init)) {
        return nullptr;
    }

    uint32_t handle = 0;
    AnkiBuffer error{};
    const int32_t status = anki_backend_open(init.data, init.size, &handle, &error);
    const std::vector<uint8_t> errorBytes = CopyAndFree(error);
    if (status != ANKI_STATUS_OK) {
        napi_throw(env, CreateNativeError(env, status, errorBytes));
        return nullptr;
    }

    napi_value result = nullptr;
    napi_create_uint32(env, handle, &result);
    return result;
}

void ExecuteCall(napi_env, void *data)
{
    auto *call = static_cast<AsyncCall *>(data);
    AnkiBuffer output{};
    AnkiBuffer error{};
    call->status = anki_backend_call(call->handle, call->service, call->method,
        call->input.data(), call->input.size(), &output, &error);
    call->output = CopyAndFree(output);
    call->error = CopyAndFree(error);
}

void CompleteCall(napi_env env, napi_status asyncStatus, void *data)
{
    std::unique_ptr<AsyncCall> call(static_cast<AsyncCall *>(data));
    if (asyncStatus == napi_ok && call->status == ANKI_STATUS_OK) {
        napi_value result = CreateUint8Array(env, call->output);
        if (result != nullptr) {
            napi_resolve_deferred(env, call->deferred, result);
        } else {
            napi_value error = CreateNativeError(env, ANKI_STATUS_NATIVE_FATAL, {});
            napi_reject_deferred(env, call->deferred, error);
        }
    } else {
        const int32_t status = asyncStatus == napi_cancelled
            ? ANKI_STATUS_NATIVE_FATAL : call->status;
        napi_value error = CreateNativeError(env, status, call->error);
        napi_reject_deferred(env, call->deferred, error);
    }
    if (call->work != nullptr) {
        napi_delete_async_work(env, call->work);
    }
}

napi_value RunMethodRaw(napi_env env, napi_callback_info info)
{
    size_t argc = 4;
    napi_value argv[4] = {nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc != 4) {
        napi_throw_type_error(env, nullptr,
            "runMethodRaw expects handle, service, method and Uint8Array");
        return nullptr;
    }

    auto call = std::make_unique<AsyncCall>();
    ByteView input;
    if (!ReadUint32(env, argv[0], call->handle) ||
        !ReadUint32(env, argv[1], call->service) ||
        !ReadUint32(env, argv[2], call->method) ||
        !ReadUint8Array(env, argv[3], input)) {
        return nullptr;
    }
    call->input.assign(input.data, input.data + input.size);

    napi_value promise = nullptr;
    napi_value resourceName = nullptr;
    if (napi_create_promise(env, &call->deferred, &promise) != napi_ok) {
        napi_throw_error(env, nullptr, "failed to create native call promise");
        return nullptr;
    }
    // AbortSync 只发取消信号；不依赖可能被集合调用占满的工作线程池。
    if (call->service == 1 && call->method == 7 && call->input.empty()) {
        ExecuteCall(env, call.get());
        CompleteCall(env, napi_ok, call.release());
        return promise;
    }
    napi_create_string_utf8(env, "jidecardsBackendCall", NAPI_AUTO_LENGTH,
        &resourceName);
    if (napi_create_async_work(env, nullptr, resourceName, ExecuteCall, CompleteCall,
        call.get(), &call->work) != napi_ok ||
        napi_queue_async_work(env, call->work) != napi_ok) {
        napi_throw_error(env, nullptr, "failed to queue native backend call");
        return nullptr;
    }
    call.release();
    return promise;
}

napi_value CloseBackend(napi_env env, napi_callback_info info)
{
    size_t argc = 1;
    napi_value argv[1] = {nullptr};
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    uint32_t handle = 0;
    if (argc != 1 || !ReadUint32(env, argv[0], handle)) {
        return nullptr;
    }
    const int32_t status = anki_backend_close(handle);
    if (status != ANKI_STATUS_OK) {
        napi_throw(env, CreateNativeError(env, status, {}));
        return nullptr;
    }
    napi_value result = nullptr;
    napi_get_undefined(env, &result);
    return result;
}

napi_value Init(napi_env env, napi_value exports)
{
    napi_property_descriptor descriptors[] = {
        {"openBackend", nullptr, OpenBackend, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"runMethodRaw", nullptr, RunMethodRaw, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"closeBackend", nullptr, CloseBackend, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports,
        sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
    return exports;
}

}

static napi_module jidecardsModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "jidecards",
    .nm_priv = nullptr,
    .reserved = {nullptr},
};

extern "C" __attribute__((constructor)) void RegisterJidecardsModule()
{
    napi_module_register(&jidecardsModule);
}
