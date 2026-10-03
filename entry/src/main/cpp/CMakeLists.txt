cmake_minimum_required(VERSION 3.5.0)
project(jidecards_entry LANGUAGES C CXX)

add_subdirectory(
    "${CMAKE_CURRENT_LIST_DIR}/../../../../native/napi_bridge"
    "${CMAKE_CURRENT_BINARY_DIR}/jidecards_native")
add_subdirectory(
    "${CMAKE_CURRENT_LIST_DIR}/../../../../native/agent-sandbox"
    "${CMAKE_CURRENT_BINARY_DIR}/agent_sandbox")
