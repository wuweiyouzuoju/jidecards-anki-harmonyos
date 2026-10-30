cmake_minimum_required(VERSION 3.5.0)
project(jidecards_native LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(OHOS_ARCH STREQUAL "arm64-v8a")
    set(RUST_TARGET "aarch64-unknown-linux-ohos")
elseif(OHOS_ARCH STREQUAL "x86_64")
    set(RUST_TARGET "x86_64-unknown-linux-ohos")
else()
    message(FATAL_ERROR "Unsupported OHOS_ARCH: ${OHOS_ARCH}")
endif()

set(WORKSPACE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
# hvigor 会按构建模式传入 CMAKE_BUILD_TYPE；Rust 产物目录必须与之一致，
# 否则 release 构建会错误地引用 debug 产物（或反过来找不到文件）。
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set(RUST_PROFILE "release")
else()
    set(RUST_PROFILE "debug")
endif()
set(RSHARMONY_ARCHIVE
    "${WORKSPACE_ROOT}/target/${RUST_TARGET}/${RUST_PROFILE}/libjidecards_core.a")

if(NOT EXISTS "${RSHARMONY_ARCHIVE}")
    if(RUST_PROFILE STREQUAL "release")
        set(RUST_BUILD_COMMAND "npm run build:app -- --release")
    else()
        set(RUST_BUILD_COMMAND "npm run build:app")
    endif()
    message(FATAL_ERROR
        "Missing ${RSHARMONY_ARCHIVE}; from the project root run: ${RUST_BUILD_COMMAND}")
endif()

add_library(jidecards_core STATIC IMPORTED GLOBAL)
set_target_properties(jidecards_core PROPERTIES IMPORTED_LOCATION "${RSHARMONY_ARCHIVE}")

add_library(jidecards SHARED
    src/native_module.cpp
    ../ohos_compat/qsort_r.c)
# hvigor 的 syncLibOutputs 会先删目标再硬链；若 ninja 产物恰好在 hvigor 约定的
# intermediates/obj/<abi> 目录（即 -DCMAKE_LIBRARY_OUTPUT_DIRECTORY 指向处），
# 源与目标同路径会被自身删除，报 ENOENT copyfile 同路径错误。
# 因此把 ninja 实际输出放到 .cxx 下的独立目录，让 hvigor 再做一次真实同步。
set_target_properties(jidecards PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/jidecards_out")
target_include_directories(jidecards PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/../rsharmony/include")
target_link_libraries(jidecards PUBLIC
    jidecards_core
    libace_napi.z.so
    libtime_service_ndk.so)
