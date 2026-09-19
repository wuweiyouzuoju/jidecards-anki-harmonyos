// SPDX-License-Identifier: AGPL-3.0-or-later
import { MATH_ASSET_BASE } from '../model/MathRendering';

/**
 * 为学习和预览提供随 HAP 打包的卡片脚本，避免 HTTPS 文档跨域读取 file/resource。
 * Invariants: 只返回固定 rawfile；该域下未知请求返回 404，不回落到网络或用户媒体。
 */
export function interceptCardAsset(url: string): WebResourceResponse | null {
  if (!url.startsWith('https://jidecards-render.local/')) {
    return null;
  }
  const response: WebResourceResponse = new WebResourceResponse();
  response.setResponseEncoding('UTF-8');
  response.setResponseMimeType('text/javascript');
  if (url === 'https://jidecards-render.local/jquery/3.7.1/jquery.min.js') {
    response.setResponseData($rawfile('jquery/jquery-3.7.1.min.js'));
  } else if (url === `${MATH_ASSET_BASE}card-math.js`) {
    response.setResponseData($rawfile('mathjax/card-math.js'));
  } else if (url === `${MATH_ASSET_BASE}tex-svg-full.js`) {
    response.setResponseData($rawfile('mathjax/tex-svg-full.js'));
  } else if (url === `${MATH_ASSET_BASE}input/mml.js`) {
    response.setResponseData($rawfile('mathjax/input/mml.js'));
  } else if (url === `${MATH_ASSET_BASE}input/mml/entities.js`) {
    response.setResponseData($rawfile('mathjax/input/mml/entities.js'));
  } else {
    response.setResponseData('');
    response.setResponseCode(404);
    response.setReasonMessage('Not Found');
    return response;
  }
  response.setResponseCode(200);
  response.setReasonMessage('OK');
  return response;
}
