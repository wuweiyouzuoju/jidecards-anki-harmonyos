// SPDX-License-Identifier: AGPL-3.0-or-later
// Headless architecture experiment. No product storage, UI or network access.
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <string>
#include <vector>

static const char* vertexSource=R"GLSL(#version 300 es
precision highp float;
const vec2 vertices[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(vertices[gl_VertexID],0.,1.);}
)GLSL";
static const char* fragmentSource=R"GLSL(#version 300 es
precision highp float;
uniform vec2 size;
uniform vec4 sourceRect;
uniform vec4 targetRect;
uniform vec2 radii;
uniform float progress;
uniform sampler2D backdrop;
out vec4 color;
float rectDistance(vec2 p,vec4 r,float radius){
 float corner=clamp(radius,0.,min(r.z,r.w)*.5);
 vec2 q=abs(p-r.xy-r.zw*.5)-r.zw*.5+corner;
 return length(max(q,0.))+min(max(q.x,q.y),0.)-corner;
}
float field(vec2 p){
 vec4 mainRect=mix(sourceRect,targetRect,progress);
 float a=rectDistance(p,mainRect,mix(radii.x,radii.y,progress));
 float remain=max(0.,1.-progress/.72);
 if(remain<=0. || progress<=0.)return a;
 vec4 root=vec4(sourceRect.xy+sourceRect.zw*(1.-remain)*.5,sourceRect.zw*remain);
 float b=rectDistance(p,root,radii.x*remain);
 float k=min(sourceRect.z,sourceRect.w)*.65*sin(3.14159265*progress);
 float h=max(0.,k-abs(a-b))/max(k,.00001);
 return min(a,b)-h*h*k*.25;
}
void main(){
 vec2 p=vec2(gl_FragCoord.x,size.y-gl_FragCoord.y);
 float d=field(p);
 float alpha=1.-smoothstep(-max(fwidth(d),.5),0.,d);
 if(alpha<=0.){color=vec4(0.);return;}
 float band=min(36.,min(targetRect.z,targetRect.w)*.4);
 float t=clamp(-d/max(band,.01),0.,1.);
 float f=t*t*(3.-2.*t);
 float shift=min(10.,band*.3)*4.*f*(1.-f);
 vec2 gradient=vec2(field(p+vec2(band,0.))-field(p-vec2(band,0.)),
                     field(p+vec2(0.,band))-field(p-vec2(0.,band)))/(2.*band);
 vec2 warped=p-shift*gradient;
 vec3 sampled=texture(backdrop,clamp(warped/size,vec2(0.),vec2(1.))).rgb;
 vec3 tinted=mix(sampled,vec3(1.),.125);
 color=vec4(tinted*alpha,alpha);
}
)GLSL";
static GLuint compile(GLenum type,const char* source){
 GLuint shader=glCreateShader(type);glShaderSource(shader,1,&source,nullptr);glCompileShader(shader);
 GLint ok=0;glGetShaderiv(shader,GL_COMPILE_STATUS,&ok);
 if(!ok){char log[4096];glGetShaderInfoLog(shader,sizeof(log),nullptr,log);std::fprintf(stderr,"shader: %s\n",log);glDeleteShader(shader);return 0;}
 return shader;
}
int main(int argc,char** argv){
 const int width=800,height=600;
 EGLDisplay display=eglGetDisplay(EGL_DEFAULT_DISPLAY);EGLint major=0,minor=0;
 if(!eglInitialize(display,&major,&minor)){std::printf("{\"status\":\"egl_unavailable\",\"error\":%d}\n",eglGetError());return 2;}
 EGLint attributes[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT_KHR,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
 EGLConfig config;EGLint count=0;eglChooseConfig(display,attributes,&config,1,&count);
 if(!count){eglTerminate(display);return 3;}
 EGLint contextAttrs[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE},surfaceAttrs[]={EGL_WIDTH,width,EGL_HEIGHT,height,EGL_NONE};
 EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,contextAttrs);
 EGLSurface surface=eglCreatePbufferSurface(display,config,surfaceAttrs);
 if(!eglMakeCurrent(display,surface,surface,context)){std::printf("{\"status\":\"context_unavailable\",\"error\":%d}\n",eglGetError());eglTerminate(display);return 4;}
 GLuint vertex=compile(GL_VERTEX_SHADER,vertexSource),fragment=compile(GL_FRAGMENT_SHADER,fragmentSource);
 if(!vertex||!fragment)return 5;
 GLuint program=glCreateProgram();glAttachShader(program,vertex);glAttachShader(program,fragment);glLinkProgram(program);
 GLint linked=0;glGetProgramiv(program,GL_LINK_STATUS,&linked);if(!linked)return 6;
 glDeleteShader(vertex);glDeleteShader(fragment);glUseProgram(program);glViewport(0,0,width,height);
 std::vector<unsigned char> pixels(width*height*4);
 for(int y=0;y<height;y++)for(int x=0;x<width;x++){
  int i=(y*width+x)*4;bool line=y%64<3 || x%96<2;
  pixels[i]=line?70:228;pixels[i+1]=line?100:235;pixels[i+2]=line?155:246;pixels[i+3]=255;
 }
 GLuint texture;glGenTextures(1,&texture);glBindTexture(GL_TEXTURE_2D,texture);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
 glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA,width,height,0,GL_RGBA,GL_UNSIGNED_BYTE,pixels.data());
 glUniform2f(glGetUniformLocation(program,"size"),width,height);
 glUniform4f(glGetUniformLocation(program,"sourceRect"),620,12,44,44);
 glUniform4f(glGetUniformLocation(program,"targetRect"),60,100,600,400);
 glUniform2f(glGetUniformLocation(program,"radii"),16,24);
 glUniform1i(glGetUniformLocation(program,"backdrop"),0);
 GLint progress=glGetUniformLocation(program,"progress");std::vector<double> timings;
 for(int i=0;i<260;i++){
  glUniform1f(progress,static_cast<float>(i%60)/59.f);
  auto start=std::chrono::steady_clock::now();glDrawArrays(GL_TRIANGLES,0,3);glFinish();
  double elapsed=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
  if(i>=20)timings.push_back(elapsed);
 }
 std::sort(timings.begin(),timings.end());
 if(argc>1){
  glUniform1f(progress,.48f);glDrawArrays(GL_TRIANGLES,0,3);glFinish();glReadPixels(0,0,width,height,GL_RGBA,GL_UNSIGNED_BYTE,pixels.data());
  std::ofstream file(argv[1],std::ios::binary);file<<"P6\n"<<width<<" "<<height<<"\n255\n";
  for(int y=height-1;y>=0;y--)for(int x=0;x<width;x++)file.write(reinterpret_cast<char*>(pixels.data()+(y*width+x)*4),3);
 }
 std::printf("{\"status\":\"measured\",\"renderer\":\"%s\",\"vendor\":\"%s\",\"samples\":%zu,\"finishMedianMs\":%.4f,\"finishP95Ms\":%.4f,\"scope\":\"offscreen GL completion including driver CPU; not UI FPS or GPU timer query\"}\n",glGetString(GL_RENDERER),glGetString(GL_VENDOR),timings.size(),timings[timings.size()/2],timings[timings.size()*95/100]);
 glDeleteTextures(1,&texture);glDeleteProgram(program);eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);
 eglDestroySurface(display,surface);eglDestroyContext(display,context);eglTerminate(display);return 0;
}
