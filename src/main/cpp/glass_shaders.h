// SPDX-License-Identifier: AGPL-3.0-or-later
#pragma once
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
uniform vec4 frameRect;
uniform vec2 origin;
uniform float dark;
uniform float swapRB;
uniform float density;
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
 float band=min(36.*density,min(targetRect.z,targetRect.w)*.4);
 float t=clamp(-d/max(band,.01),0.,1.);
 float f=t*t*(3.-2.*t);
 float shift=min(10.*density,band*.3)*4.*f*(1.-f);
 vec2 gradient=vec2(field(p+vec2(band,0.))-field(p-vec2(band,0.)),
                     field(p+vec2(0.,band))-field(p-vec2(0.,band)))/(2.*band);
 vec2 warped=p-shift*gradient;
 vec3 sampled=texture(backdrop,clamp((origin+warped-frameRect.xy)/frameRect.zw,vec2(0.),vec2(1.))).rgb;
 if(swapRB>.5)sampled=sampled.bgr;
 vec3 tinted=mix(sampled,dark>.5?vec3(.071,.094,.125):vec3(1.),dark>.5?.156:.125);
 color=vec4(tinted*alpha,alpha);
}
)GLSL";
