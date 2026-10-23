#include <node_api.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

extern void sp_init(void);
extern void sp_set_panic_sink(void (*fn)(void *, const uint8_t *, size_t, uint64_t), void *ctx);
extern double sp_noop(double);
extern double sp_create_element(const uint8_t *p, size_t len);
extern double sp_append_child(double, double);
extern double sp_set_attribute(double, const uint8_t *, size_t, const uint8_t *, size_t);
extern void sp_get_attribute(double, const uint8_t *, size_t, const uint8_t **, size_t *);
extern double sp_count_by_tag(double, const uint8_t *, size_t);
extern double sp_reset(void);

static void sink(void *ctx, const uint8_t *msg, size_t len, uint64_t addr) { (void)ctx; (void)addr; fprintf(stderr, "panic: %.*s\n", (int)len, msg); abort(); }

static char buf1[4096], buf2[4096];
static size_t str_arg(napi_env env, napi_value v, char *buf) {
  size_t n; napi_get_value_string_utf8(env, v, buf, 4096, &n); return n;
}
static napi_value num(napi_env env, double d) { napi_value r; napi_create_double(env, d, &r); return r; }

static napi_value Noop(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value a[1]; napi_get_cb_info(env, info, &argc, a, NULL, NULL);
  double x; napi_get_value_double(env, a[0], &x); return num(env, sp_noop(x));
}
static napi_value CreateElement(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value a[1]; napi_get_cb_info(env, info, &argc, a, NULL, NULL);
  size_t n = str_arg(env, a[0], buf1); return num(env, sp_create_element((uint8_t*)buf1, n));
}
static napi_value AppendChild(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value a[2]; napi_get_cb_info(env, info, &argc, a, NULL, NULL);
  double p, c; napi_get_value_double(env, a[0], &p); napi_get_value_double(env, a[1], &c);
  return num(env, sp_append_child(p, c));
}
static napi_value SetAttribute(napi_env env, napi_callback_info info) {
  size_t argc = 3; napi_value a[3]; napi_get_cb_info(env, info, &argc, a, NULL, NULL);
  double id; napi_get_value_double(env, a[0], &id);
  size_t n1 = str_arg(env, a[1], buf1), n2 = str_arg(env, a[2], buf2);
  return num(env, sp_set_attribute(id, (uint8_t*)buf1, n1, (uint8_t*)buf2, n2));
}
static napi_value GetAttribute(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value a[2]; napi_get_cb_info(env, info, &argc, a, NULL, NULL);
  double id; napi_get_value_double(env, a[0], &id);
  size_t n1 = str_arg(env, a[1], buf1);
  const uint8_t *out; size_t outn; sp_get_attribute(id, (uint8_t*)buf1, n1, &out, &outn);
  napi_value r; napi_create_string_utf8(env, (const char*)out, outn, &r); return r;
}
static napi_value CountByTag(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value a[2]; napi_get_cb_info(env, info, &argc, a, NULL, NULL);
  double id; napi_get_value_double(env, a[0], &id);
  size_t n1 = str_arg(env, a[1], buf1); return num(env, sp_count_by_tag(id, (uint8_t*)buf1, n1));
}
static napi_value Reset(napi_env env, napi_callback_info info) { return num(env, sp_reset()); }

NAPI_MODULE_INIT() {
  sp_set_panic_sink(sink, NULL);
  sp_init();
  napi_property_descriptor d[] = {
    {"noop", 0, Noop, 0, 0, 0, napi_default, 0},
    {"createElement", 0, CreateElement, 0, 0, 0, napi_default, 0},
    {"appendChild", 0, AppendChild, 0, 0, 0, napi_default, 0},
    {"setAttribute", 0, SetAttribute, 0, 0, 0, napi_default, 0},
    {"getAttribute", 0, GetAttribute, 0, 0, 0, napi_default, 0},
    {"countByTag", 0, CountByTag, 0, 0, 0, napi_default, 0},
    {"reset", 0, Reset, 0, 0, 0, napi_default, 0},
  };
  napi_define_properties(env, exports, sizeof(d)/sizeof(d[0]), d);
  return exports;
}
