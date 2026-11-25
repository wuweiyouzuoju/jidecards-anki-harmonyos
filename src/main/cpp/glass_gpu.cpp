// SPDX-License-Identifier: AGPL-3.0-or-later
#include <napi/native_api.h>
#include <native_window/external_window.h>
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <cstdint>
#include <cmath>
#include <memory>
#include <unordered_map>
#include "glass_shaders.h"

namespace {
struct Renderer {
 OHNativeWindow* window=nullptr;
 EGLDisplay display=EGL_NO_DISPLAY;
 EGLContext context=EGL_NO_CONTEXT;
 EGLSurface surface=EGL_NO_SURFACE;
 GLuint program=0,texture=0;
 bool uploaded=false,bgra=false;
 int width=0,height=0;
 struct Locations {GLint size,source,target,radii,progress,origin,frame,dark,swapRB,backdrop,density;} locations;
 ~Renderer(){
  if(display!=EGL_NO_DISPLAY){
   if(context!=EGL_NO_CONTEXT&&surface!=EGL_NO_SURFACE){
    eglMakeCurrent(display,surface,surface,context);
    if(texture)glDeleteTextures(1,&texture);if(program)glDeleteProgram(program);
   }
   eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
   if(surface!=EGL_NO_SURFACE)eglDestroySurface(display,surface);
   if(context!=EGL_NO_CONTEXT)eglDestroyContext(display,context);
   // EGLDisplay is process-shared; terminating it would invalidate a sibling glass context.
  }
  if(window)OH_NativeWindow_DestroyNativeWindow(window);
 }
 bool current(){return display!=EGL_NO_DISPLAY&&eglMakeCurrent(display,surface,surface,context)==EGL_TRUE;}
};
struct Store {std::unordered_map<int32_t,std::unique_ptr<Renderer>> renderers;int32_t nextId=1;};
struct ContextScope {
 EGLDisplay display=eglGetCurrentDisplay();EGLContext context=eglGetCurrentContext();
 EGLSurface draw=eglGetCurrentSurface(EGL_DRAW),read=eglGetCurrentSurface(EGL_READ);
 ~ContextScope(){if(display!=EGL_NO_DISPLAY)eglMakeCurrent(display,draw,read,context);else {EGLDisplay current=eglGetCurrentDisplay();if(current!=EGL_NO_DISPLAY)eglMakeCurrent(current,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);}}
};
GLuint compile(GLenum type,const char* text){
 GLuint shader=glCreateShader(type);glShaderSource(shader,1,&text,nullptr);glCompileShader(shader);
 GLint ok=0;glGetShaderiv(shader,GL_COMPILE_STATUS,&ok);if(!ok){glDeleteShader(shader);return 0;}return shader;
}
napi_value number(napi_env env,int32_t n){napi_value value;napi_create_int32(env,n,&value);return value;}
napi_value boolean(napi_env env,bool flag){napi_value value;napi_get_boolean(env,flag,&value);return value;}
napi_value empty(napi_env env){napi_value value;napi_get_undefined(env,&value);return value;}
Renderer* find(napi_env env,Store* store,napi_value value){if(!store)return nullptr;int32_t id=0;if(napi_get_value_int32(env,value,&id)!=napi_ok)return nullptr;auto i=store->renderers.find(id);return i==store->renderers.end()?nullptr:i->second.get();}
napi_value create(napi_env env,napi_callback_info info){
 size_t count=1;napi_value args[1];void* data=nullptr;napi_get_cb_info(env,info,&count,args,nullptr,&data);auto* store=static_cast<Store*>(data);
 if(count!=1||!store||store->renderers.size()>=32)return number(env,0);
 ContextScope scope;
 uint64_t surfaceId=0;bool lossless=false;
 if(napi_get_value_bigint_uint64(env,args[0],&surfaceId,&lossless)!=napi_ok||!lossless)return number(env,0);
 auto r=std::make_unique<Renderer>();
 if(OH_NativeWindow_CreateNativeWindowFromSurfaceId(surfaceId,&r->window)!=0)return number(env,0);
 r->display=eglGetDisplay(EGL_DEFAULT_DISPLAY);EGLint major,minor;
 if(!eglInitialize(r->display,&major,&minor))return number(env,0);
 EGLint attribs[]={EGL_SURFACE_TYPE,EGL_WINDOW_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT_KHR,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
 EGLConfig config;EGLint configurations=0;eglChooseConfig(r->display,attribs,&config,1,&configurations);
 if(!configurations)return number(env,0);
 EGLint ctx[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
 r->context=eglCreateContext(r->display,config,EGL_NO_CONTEXT,ctx);
 r->surface=eglCreateWindowSurface(r->display,config,reinterpret_cast<EGLNativeWindowType>(r->window),nullptr);
 if(!r->current())return number(env,0);
 eglSwapInterval(r->display,0);
 GLuint vertex=compile(GL_VERTEX_SHADER,vertexSource),fragment=compile(GL_FRAGMENT_SHADER,fragmentSource);
 if(!vertex||!fragment){if(vertex)glDeleteShader(vertex);if(fragment)glDeleteShader(fragment);return number(env,0);}
 r->program=glCreateProgram();glAttachShader(r->program,vertex);glAttachShader(r->program,fragment);glLinkProgram(r->program);
 glDeleteShader(vertex);glDeleteShader(fragment);
 GLint linked=0;glGetProgramiv(r->program,GL_LINK_STATUS,&linked);if(!linked)return number(env,0);
 auto loc=[&](const char* name){return glGetUniformLocation(r->program,name);};
 r->locations={loc("size"),loc("sourceRect"),loc("targetRect"),loc("radii"),loc("progress"),loc("origin"),loc("frameRect"),loc("dark"),loc("swapRB"),loc("backdrop"),loc("density")};
 glGenTextures(1,&r->texture);glBindTexture(GL_TEXTURE_2D,r->texture);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
 int32_t id=store->nextId++;store->renderers.emplace(id,std::move(r));return number(env,id);
}
napi_value upload(napi_env env,napi_callback_info info){
 size_t count=5;napi_value args[5];void* data=nullptr;napi_get_cb_info(env,info,&count,args,nullptr,&data);auto* store=static_cast<Store*>(data);if(count!=5)return boolean(env,false);
 ContextScope scope;Renderer* r=find(env,store,args[0]);if(!r)return boolean(env,false);
 void* pixels=nullptr;size_t length=0;int32_t width=0,height=0;bool bgra=false;
 if(napi_get_arraybuffer_info(env,args[1],&pixels,&length)!=napi_ok||napi_get_value_int32(env,args[2],&width)!=napi_ok||
  napi_get_value_int32(env,args[3],&height)!=napi_ok||napi_get_value_bool(env,args[4],&bgra)!=napi_ok)return boolean(env,false);
 if(width<=0||height<=0||width>2048||height>2048||length!=static_cast<size_t>(width)*height*4||!r->current())return boolean(env,false);
 glBindTexture(GL_TEXTURE_2D,r->texture);glPixelStorei(GL_UNPACK_ALIGNMENT,1);
 glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,width,height,0,GL_RGBA,GL_UNSIGNED_BYTE,pixels);r->bgra=bgra;r->uploaded=glGetError()==GL_NO_ERROR;
 return boolean(env,r->uploaded);
}
napi_value draw(napi_env env,napi_callback_info info){
 size_t count=2;napi_value args[2];void* data=nullptr;napi_get_cb_info(env,info,&count,args,nullptr,&data);auto* store=static_cast<Store*>(data);if(count!=2)return boolean(env,false);
 ContextScope scope;Renderer* r=find(env,store,args[0]);if(!r||!r->uploaded)return boolean(env,false);
 napi_typedarray_type type;size_t length=0,offset=0;void* raw=nullptr;napi_value buffer;
 if(napi_get_typedarray_info(env,args[1],&type,&length,&raw,&buffer,&offset)!=napi_ok||type!=napi_float64_array||length!=21)return boolean(env,false);
 const double* u=static_cast<double*>(raw);for(size_t i=0;i<length;i++)if(!std::isfinite(u[i])||std::abs(u[i])>1e7)return boolean(env,false);
 if(u[0]<=0||u[1]<=0||u[0]>16384||u[1]>16384||u[4]<=0||u[5]<=0||u[9]<=0||u[10]<=0||u[17]<=0||u[18]<=0||u[20]<=0||u[20]>8||!r->current())return boolean(env,false);
 if(r->width!=static_cast<int>(u[0])||r->height!=static_cast<int>(u[1])){
  if(OH_NativeWindow_NativeWindowHandleOpt(r->window,SET_BUFFER_GEOMETRY,static_cast<int>(u[0]),static_cast<int>(u[1]))!=0)return boolean(env,false);
  r->width=static_cast<int>(u[0]);r->height=static_cast<int>(u[1]);
 }
 glViewport(0,0,static_cast<GLsizei>(u[0]),static_cast<GLsizei>(u[1]));glUseProgram(r->program);
 glActiveTexture(GL_TEXTURE0);glBindTexture(GL_TEXTURE_2D,r->texture);
 const auto& l=r->locations;
 glUniform1f(l.density,u[20]);
 glUniform2f(l.size,u[0],u[1]);glUniform4f(l.source,u[2],u[3],u[4],u[5]);
 glUniform4f(l.target,u[7],u[8],u[9],u[10]);glUniform2f(l.radii,u[6],u[11]);
 glUniform1f(l.progress,std::max(0.,std::min(1.,u[12])));glUniform2f(l.origin,u[13],u[14]);
 glUniform4f(l.frame,u[15],u[16],u[17],u[18]);glUniform1f(l.dark,u[19]);
 glUniform1f(l.swapRB,r->bgra?1.f:0.f);glUniform1i(l.backdrop,0);
 glDisable(GL_BLEND);glClearColor(0,0,0,0);glClear(GL_COLOR_BUFFER_BIT);glDrawArrays(GL_TRIANGLES,0,3);
 return boolean(env,glGetError()==GL_NO_ERROR&&eglSwapBuffers(r->display,r->surface)==EGL_TRUE);
}
napi_value destroy(napi_env env,napi_callback_info info){size_t count=1;napi_value args[1];void* data=nullptr;napi_get_cb_info(env,info,&count,args,nullptr,&data);auto* store=static_cast<Store*>(data);ContextScope scope;int32_t id=0;if(count==1&&napi_get_value_int32(env,args[0],&id)==napi_ok)store->renderers.erase(id);return empty(env);}
void cleanup(void* data){ContextScope scope;delete static_cast<Store*>(data);}
}
EXTERN_C_START
static napi_value Init(napi_env env,napi_value exports){
 auto* store=new Store();
 napi_property_descriptor descriptors[]={
  {"create",nullptr,create,nullptr,nullptr,nullptr,napi_default,store},
  {"upload",nullptr,upload,nullptr,nullptr,nullptr,napi_default,store},
  {"draw",nullptr,draw,nullptr,nullptr,nullptr,napi_default,store},
  {"destroy",nullptr,destroy,nullptr,nullptr,nullptr,napi_default,store}};
 napi_define_properties(env,exports,4,descriptors);napi_add_env_cleanup_hook(env,cleanup,store);return exports;
}
EXTERN_C_END
static napi_module module={1,0,nullptr,Init,"jide_glass_gpu",nullptr,{0}};
extern "C" __attribute__((constructor)) void RegisterGlassModule(){napi_module_register(&module);}
