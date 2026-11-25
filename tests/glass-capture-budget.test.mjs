import test from 'node:test';
import assert from 'node:assert/strict';
import { glassCaptureScale } from '../src/core/GlassCapture.ts';
test('capture budget bounds tablet textures in both orientations without upscaling small sources', () => {
 for(const [w,h] of [[1840,2800],[2800,1840],[1280,2832],[340,440],[0,0]]) {
  const scale=glassCaptureScale(w,h);
  assert.ok(scale>0&&scale<=.5);
  assert.ok(Math.max(w,h)*scale<=512);
 }
 assert.equal(glassCaptureScale(400,600),.5);
});
test('physical blur radius remains independent of texture resolution',()=>{
 const width=1840,physicalRadius=5.5*2.5;
 const scale=glassCaptureScale(width,2800);
 const pixelWidth=Math.round(width*scale);
 const textureRadius=physicalRadius*pixelWidth/width;
 assert.equal(textureRadius*width/pixelWidth,physicalRadius);
});


test('minimum blur keeps native texture pixels while frost retains its bounded budget', () => {
 for (const [width,height] of [[2800,1752],[1752,2800],[1200,900]]) {
  assert.equal(glassCaptureScale(width,height,0),1);
  assert.equal(glassCaptureScale(width,height,0.05),1);
  assert.ok(Math.max(width,height)*glassCaptureScale(width,height,0.25)<=1536);
  assert.ok(Math.max(width,height)*glassCaptureScale(width,height,1)<=512);
 }
});
