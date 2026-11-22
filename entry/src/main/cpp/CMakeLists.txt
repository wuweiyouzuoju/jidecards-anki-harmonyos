cmake_minimum_required(VERSION 3.5.0)
project(jidecards_entry LANGUAGES C CXX)

# HarmonyOS bundles a complete Clang toolchain, not a GCC installation.
# The SDK sets these to its LLVM directory; passing that as --gcc-toolchain is unused.
set(CMAKE_C_COMPILER_EXTERNAL_TOOLCHAIN "")
set(CMAKE_CXX_COMPILER_EXTERNAL_TOOLCHAIN "")

add_subdirectory(
    "${CMAKE_CURRENT_LIST_DIR}/../../../../native/napi_bridge"
    "${CMAKE_CURRENT_BINARY_DIR}/jidecards_native")
add_subdirectory(
    "${CMAKE_CURRENT_LIST_DIR}/../../../../native/agent-sandbox"
    "${CMAKE_CURRENT_BINARY_DIR}/agent_sandbox")
