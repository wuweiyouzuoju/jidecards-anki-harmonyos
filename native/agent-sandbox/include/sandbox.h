#ifndef JIDECARDS_SANDBOX_H
#define JIDECARDS_SANDBOX_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
uint64_t sandbox_create(const uint8_t *source, size_t source_len, const uint8_t *input, size_t input_len);
char *sandbox_execute(uint64_t id);
void sandbox_cancel(uint64_t id);
void sandbox_release(uint64_t id);
void sandbox_string_free(char *text);
#ifdef __cplusplus
}
#endif
#endif
