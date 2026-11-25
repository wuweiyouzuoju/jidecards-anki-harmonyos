// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { glassDistance, glassSample, glassMesh, glassTexturePoint } from '../src/core/GlassOptics.ts';
test('玻璃折射保持中心、边缘向内采样且左右对称', () => {
  assert.deepEqual(glassSample(100, 40, 200, 80, 20, 14, 9), {x:100,y:40});
  const left=glassSample(1,40,200,80,20,14,9),right=glassSample(199,40,200,80,20,14,9);
  assert.ok(left.x>1 && left.x<10); assert.ok(right.x<199);
  assert.ok(Math.abs(left.x+right.x-200)<1e-8);
  assert.equal(glassDistance(20,0,200,80,20),0);
  assert.ok(glassDistance(0,0,200,80,20)>0);
});
test('圆角折射平滑连接内部透镜放大，中心位置保持稳定',()=>{
  const p=glassSample(6,6,80,80,20,14,9);
  assert.ok(p.x>6 && p.y>6); assert.ok(Math.abs(p.x-p.y)<1e-8);
  assert.deepEqual(glassSample(14,40,200,80,20,14,9),{x:15.72,y:40});
  assert.deepEqual(glassSample(100,40,200,80,20,14,9),{x:100,y:40});
});
test('网格有界、三角形索引有效，极小尺寸不产生NaN',()=>{
  for(const [w,h,r] of [[200,80,20],[32,32,16],[1,1,20],[1200,2000,24]]) {
    const mesh=glassMesh(w,h,r,2);
    assert.equal(mesh.positions.length,mesh.texture.length);
    assert.ok(mesh.positions.length<=97*97);
    assert.equal(mesh.indices.length%3,0);
    for(const i of mesh.indices) assert.ok(i>=0 && i<mesh.positions.length);
    for(const p of mesh.texture) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  }
});

test('菜单采样从自身窗口矩形开始，不采页面左上角的触发按钮',()=>{
 assert.deepEqual(glassTexturePoint({x:0,y:0},56,325,0,137,.5,.5),{x:28,y:94});
 assert.deepEqual(glassTexturePoint({x:100,y:80},56,325,0,137,.5,.5),{x:78,y:134});
});

test('refraction field remains continuous across the rounded clipping contour', () => {
  const r=24, edge=r-r/Math.sqrt(2), epsilon=.001;
  const before=glassSample(edge-epsilon,edge-epsilon,200,400,r,20,15);
  const after=glassSample(edge+epsilon,edge+epsilon,200,400,r,20,15);
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.01);
  const bandA=glassSample(20-epsilon,100,200,400,r,20,15);
  const bandB=glassSample(20+epsilon,100,200,400,r,20,15);
  assert.ok(Math.hypot(bandA.x-bandB.x,bandA.y-bandB.y)<.01);
});

test('visible rim sampling does not fold back or tear', () => {
  let previous=-Infinity;
  for(let x=0;x<=40;x+=.1) {
    const point=glassSample(x,100,200,400,24,28,15);
    assert.ok(point.x>previous);previous=point.x;
  }
});


test('rounded menu texture triangles retain orientation through corner medial axes', () => {
  for (const density of [1, 2, 3.5]) for (const width of [88, 136, 168, 280])
    for (const height of [44, 132, 352]) for (const radius of [0, 12, 16, 24]) {
      const mesh = glassMesh(width*density, height*density, radius*density, density);
      for (let i=0; i<mesh.indices.length; i+=3) {
        const [a,b,c] = mesh.indices.slice(i,i+3).map(index => mesh.texture[index]);
        assert.ok((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) > 0,
          `folded texture: ${width}x${height}, radius ${radius}, density ${density}, triangle ${i/3}`);
      }
    }
});
