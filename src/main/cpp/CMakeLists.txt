# SPDX-License-Identifier: AGPL-3.0-or-later
cmake_minimum_required(VERSION 3.5.0)
project(jide_glass_gpu)
set(CMAKE_CXX_STANDARD 17)
add_library(jide_glass_gpu SHARED glass_gpu.cpp)
target_compile_options(jide_glass_gpu PRIVATE -Wall -Wextra -Werror -Wno-unused-command-line-argument -O2)
target_link_libraries(jide_glass_gpu PUBLIC libace_napi.z.so libEGL.so libGLESv3.so libnative_window.so)
