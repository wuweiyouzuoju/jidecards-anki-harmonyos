// SPDX-License-Identifier: AGPL-3.0-or-later

// Anki 26.05 reviewer geometry: normalized coordinates, angle in 1/10000 turns,
// polygon position relative to the minimum point, and independent text annotations.
// This script is shared by study and preview; it never rewrites note contents.
export const IMAGE_OCCLUSION_SCRIPT: string = `<script>
(function () {
  window.anki = window.anki || {};
  if (window.anki.imageOcclusion) { return; }
  var masksVisible = true;
  function number(value, fallback) {
    var parsed = Number(value);
    return value !== undefined && value !== '' && isFinite(parsed) ? parsed : fallback;
  }
  function style(canvas, kind) {
    var computed = window.getComputedStyle(canvas);
    var prefix = '--' + kind + '-shape-';
    var border = computed.getPropertyValue(prefix + 'border').trim().split(/\\s+/);
    return {
      fill: computed.getPropertyValue(prefix + 'color').trim() ||
        (kind === 'active' ? '#ff8e8e' : kind === 'inactive' ? '#ffeba2' : '#ff8e8e00'),
      stroke: border[1] || (kind === 'highlight' ? '#ff8e8e' : '#212121'),
      width: Math.max(0, number(parseFloat(border[0]), 1))
    };
  }
  function draw(ctx, canvas, data, appearance) {
    var left = Math.round(number(data.left, 0) * canvas.width);
    var top = Math.round(number(data.top, 0) * canvas.height);
    var angle = (number(data.angle, 0) % 10000) * Math.PI * 2 / 10000;
    ctx.save();
    ctx.fillStyle = appearance.fill;
    ctx.strokeStyle = appearance.stroke;
    ctx.lineWidth = appearance.width;
    try {
      if (data.shape === 'rect' || data.shape === 'ellipse') {
        ctx.translate(left, top);
        ctx.rotate(angle);
        if (data.shape === 'rect') {
          var width = Math.round(number(data.width, 0) * canvas.width);
          var height = Math.round(number(data.height, 0) * canvas.height);
          if (width <= 0 || height <= 0) { return; }
          ctx.fillRect(0, 0, width, height);
          if (appearance.width) { ctx.strokeRect(0, 0, width, height); }
        } else {
          var rx = Math.round(number(data.rx, number(data.width, 0) / 2) * canvas.width);
          var ry = Math.round(number(data.ry, number(data.height, 0) / 2) * canvas.height);
          if (rx <= 0 || ry <= 0) { return; }
          ctx.beginPath();
          ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
          ctx.closePath(); ctx.fill();
          if (appearance.width) { ctx.stroke(); }
        }
      } else if (data.shape === 'polygon') {
        var pairs = (data.points || '').trim().split(/\\s+/);
        var points = [], minX = Infinity, minY = Infinity;
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split(',');
          var x = number(pair[0], NaN), y = number(pair[1], NaN);
          if (pair.length !== 2 || !isFinite(x) || !isFinite(y)) { return; }
          x = Math.round(x * canvas.width); y = Math.round(y * canvas.height);
          points.push([x, y]); minX = Math.min(minX, x); minY = Math.min(minY, y);
        }
        if (points.length < 3) { return; }
        // Matches the upstream review renderer (polygon angle is not applied).
        ctx.translate(left - minX, top - minY);
        ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
        for (var p = 1; p < points.length; p++) { ctx.lineTo(points[p][0], points[p][1]); }
        ctx.closePath(); ctx.fill();
        if (appearance.width) { ctx.stroke(); }
      } else if (data.shape === 'text') {
        var scale = number(data.scale, 1);
        var fontSize = number(data.fontSize, 40 / canvas.height) * canvas.height;
        if (scale <= 0 || fontSize <= 0) { return; }
        ctx.font = fontSize + 'px Arial'; ctx.textBaseline = 'top';
        ctx.scale(scale, scale);
        left /= scale; top /= scale;
        ctx.translate(left, top); ctx.rotate(angle);
        var lines = (data.text || '').split('\\n');
        var metrics = ctx.measureText('M');
        var lineHeight = 1.5 * (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
        if (!isFinite(lineHeight) || lineHeight <= 0) { lineHeight = fontSize * 1.5; }
        var textWidth = 0;
        for (var l = 0; l < lines.length; l++) { textWidth = Math.max(textWidth, ctx.measureText(lines[l]).width); }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, textWidth + 5, lines.length * lineHeight + 5);
        ctx.fillStyle = data.fill || '#000000';
        for (var t = 0; t < lines.length; t++) { ctx.fillText(lines[t], 0, t * lineHeight); }
      }
    } finally { ctx.restore(); }
  }
  function drawGroup(ctx, canvas, selector, kind) {
    var nodes = document.querySelectorAll(selector), appearance = style(canvas, kind);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], data = node.dataset;
      if (node.tagName !== 'DIV') { continue; }
      if (data.shape !== 'text' && (!masksVisible ||
        (kind === 'inactive' && data.occludeinactive !== '1'))) { continue; }
      // Upstream's stock inactive fill is a sentinel: custom CSS still takes precedence.
      var fill = kind === 'inactive' && data.fill && data.fill !== '#ffeba2' ? data.fill : appearance.fill;
      draw(ctx, canvas, data, { fill: fill, stroke: appearance.stroke, width: appearance.width });
    }
  }
  function redraw() {
    var canvas = document.getElementById('image-occlusion-canvas');
    var img = document.querySelector('#image-occlusion-container img');
    if (!canvas || !img || !img.complete || !img.naturalWidth || !img.naturalHeight) { return; }
    // Match upstream's 4096² pixel budget for large source photographs.
    var factor = Math.min(1, 4096 / Math.sqrt(img.naturalWidth * img.naturalHeight));
    canvas.width = Math.max(1, Math.floor(img.naturalWidth * factor));
    canvas.height = Math.max(1, Math.floor(img.naturalHeight * factor));
    var ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGroup(ctx, canvas, '.cloze', 'active');
    drawGroup(ctx, canvas, '.cloze-inactive', 'inactive');
    drawGroup(ctx, canvas, '.cloze-highlight', 'highlight');
  }
  window.anki.imageOcclusion = {
    setup: function () {
      var canvas = document.getElementById('image-occlusion-canvas');
      var img = document.querySelector('#image-occlusion-container img');
      if (!canvas || !img) { return; }
      if (img.complete) { redraw(); }
      else if (img.dataset.jideOcclusionLoad !== '1') {
        img.dataset.jideOcclusionLoad = '1'; img.addEventListener('load', redraw);
      }
      // Preserve the existing ArkWeb touch limitation until device acceptance.
      var button = document.getElementById('toggle');
      if (button) { button.style.display = 'none'; }
    },
    toggle: function () { masksVisible = !masksVisible; redraw(); }
  };
})();
</script>`;
