let imgElement = document.getElementById('canvasInput');
let inputElement = document.getElementById('fileInput');
let cropButtonElement = document.getElementById('transformAndCropButton');
let downloadButtonElement = document.getElementById('downloadCroped');

inputElement.addEventListener(
  'change',
  (e) => {
    imgElement.src = URL.createObjectURL(e.target.files[0]);
    imgElement.style.display = 'block';
    document.getElementById('image-size').innerText =
      e.target.files.item(0).size / (1024 * 1024);
  },
  false
);

cropButtonElement.addEventListener('click', doPerspectiveTransform);

downloadButtonElement.addEventListener('click', downloadCroppedImage);

imgElement.onload = function (data) {
  let startTime = new Date();

  preProcessImage();
  processImage();
  postProcessImage();

  let stopTime = new Date();

  checkValidty(startTime, stopTime);
};

function checkValidty(startTime, stopTime) {
  if (isValid) {
    document.getElementById('time-taken').innerText =
      (stopTime - startTime) / 1000;
  } else {
    document.getElementById('time-taken').innerText = 'invalid';
  }

  document.getElementById('intermediateResults').style.display = 'block';
}

let isValid = true;
let imageProcessingSteps = {};
let bluringType = 'Gaussian';
let globalContours;
let globalHierarchy;
let globalPoints;

function preProcessImage() {
  document.getElementById('input-image').style.display = 'block';

  let mat = cv.imread('canvasInput');
  cv.imshow('canvasIntermediate0', mat);
  mat.delete();
}

function processImage() {
  const STEPS = [
    'GRAY_SCALING',
    'BLURING',
    'MORPHING',
    'EDGE_DETECTION',
    'CONTOUR_DETECTION',
    'APPROX_POLY_DP_DETECTION',
    'RECTANGLE_DETECTION',
  ];

  for (let i = 0; i < STEPS.length; i++) {
    let canvasInputString = 'canvasIntermediate' + i;
    let canvasOutputString = 'canvasIntermediate' + (i + 1);

    let dst = imageProcessingSteps[STEPS[i]](canvasInputString);
    cv.imshow(canvasOutputString, dst);
    dst.delete();
  }
}

function postProcessImage() {
  let mat = cv.imread('canvasIntermediate7');
  cv.imshow('canvasIntermediate', mat);
  mat.delete();

  document.getElementById('intermediate-image').style.display = 'block';

  selectImage();

  cropButtonElement.style.display = 'inline';

  downloadButtonElement.style.display = 'inline';
}

imageProcessingSteps['GRAY_SCALING'] = function doGrayScaling(
  canvasInputString
) {
  let src = cv.imread(canvasInputString);
  let dst = new cv.Mat();

  cv.cvtColor(src, dst, cv.COLOR_BGR2GRAY, 0);

  src.delete();

  return dst;
};

imageProcessingSteps['BLURING'] = function doGaussianBluring(
  canvasInputString
) {
  let src = cv.imread(canvasInputString);
  let dst = new cv.Mat();

  switch (bluringType) {
    case 'Gaussian':
      let ksize = new cv.Size(5, 5);
      cv.GaussianBlur(src, dst, ksize, 0, 0, cv.BORDER_DEFAULT);
      break;
    case 'BilateralFilter':
      cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
      cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);
      break;
  }

  src.delete();
  return dst;
};

imageProcessingSteps['MORPHING'] = function doMorphing(canvasInputString) {
  let src = cv.imread(canvasInputString);
  let dst = new cv.Mat();

  let anchor = new cv.Point(-1, -1);
  let ksize = new cv.Size(5, 5);

  // You can try more different parameters
  let M = cv.getStructuringElement(cv.MORPH_RECT, ksize);
  cv.dilate(
    src,
    dst,
    M,
    anchor,
    1,
    cv.BORDER_CONSTANT,
    cv.morphologyDefaultBorderValue()
  );

  src.delete();
  M.delete();

  return dst;
};

imageProcessingSteps['EDGE_DETECTION'] = function doEdgeDetection(
  canvasInputString
) {
  let src = cv.imread(canvasInputString);
  let dst = new cv.Mat();
  cv.cvtColor(src, src, cv.COLOR_RGB2GRAY, 0);
  // You can try more different parameters
  cv.Canny(src, dst, 100, 200, 3, false);

  src.delete();
  return dst;
};

imageProcessingSteps['CONTOUR_DETECTION'] = function doContourDetection(
  canvasInputString
) {
  let mainSrc = cv.imread('canvasInput');

  let src = cv.imread(canvasInputString);
  let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);

  cv.cvtColor(mainSrc, dst, cv.COLOR_RGBA2RGB, 0);

  cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
  cv.threshold(src, src, 120, 200, cv.THRESH_BINARY);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  // You can try more different parameters
  cv.findContours(
    src,
    contours,
    hierarchy,
    cv.RETR_CCOMP,
    cv.CHAIN_APPROX_SIMPLE
  );

  // Draw all contours
  for (let i = 0; i < contours.size(); ++i) {
    let color = new cv.Scalar(
      Math.round(Math.random() * 255),
      Math.round(Math.random() * 255),
      Math.round(Math.random() * 255)
    );
    cv.drawContours(dst, contours, i, color, 5, cv.LINE_AA, hierarchy, 100);
  }

  globalContours = contours;
  globalHierarchy = hierarchy;

  src.delete();
  mainSrc.delete();

  return dst;
};

imageProcessingSteps['APPROX_POLY_DP_DETECTION'] =
  function doApproxPolyDPDetection(canvasInputString) {
    let mainSrc = cv.imread('canvasInput');

    let dst = cv.Mat.zeros(mainSrc.rows, mainSrc.cols, cv.CV_8UC3);

    cv.cvtColor(mainSrc, dst, cv.COLOR_RGBA2RGB, 0);

    let approxPolyDPs = new cv.MatVector();

    for (let i = 0; i < globalContours.size(); i++) {
      let approxPolyDP = new cv.Mat();
      let contour = globalContours.get(i);

      cv.approxPolyDP(
        contour,
        approxPolyDP,
        0.05 * cv.arcLength(contour, false),
        true
      );

      approxPolyDPs.push_back(approxPolyDP);
    }

    globalContours = approxPolyDPs;

    // Draw all contours
    for (let i = 0; i < approxPolyDPs.size(); ++i) {
      let color = new cv.Scalar(
        Math.round(Math.random() * 255),
        Math.round(Math.random() * 255),
        Math.round(Math.random() * 255)
      );
      cv.drawContours(
        dst,
        approxPolyDPs,
        i,
        color,
        5,
        cv.LINE_AA,
        globalHierarchy,
        100
      );
    }

    mainSrc.delete();

    return dst;
  };

imageProcessingSteps['RECTANGLE_DETECTION'] = function doRectangleDetection(
  canvasInputString
) {
  // Helper function
  function _findLargestRectangle(contours) {
    let contoursMetadata = [];

    for (let i = 0; i < contours.size(); ++i) {
      let rect = cv.minAreaRect(contours.get(i));

      let area = rect.size.height * rect.size.width;

      contoursMetadata.push([area, i]);
    }

    contoursMetadata.sort((a, b) => {
      let i = b[0] - a[0];

      if (i == 0) {
        return a[1] - b[1];
      }

      return i;
    });

    return contoursMetadata;
  }

  // Draw main contour
  let contours = globalContours;
  let hierarchy = globalHierarchy;

  let mainSrc = cv.imread('canvasInput');
  let dst = cv.Mat.zeros(mainSrc.rows, mainSrc.cols, cv.CV_8UC3);
  cv.cvtColor(mainSrc, dst, cv.COLOR_RGBA2RGB, 0);

  let sortedContours = _findLargestRectangle(contours);

  // draw contours with random Scalar
  let colors = [
    new cv.Scalar(255, 0, 0),
    new cv.Scalar(0, 255, 0),
    new cv.Scalar(0, 0, 255),
  ];

  for (let i = 0; i < Math.min(3, contours.size()); ++i) {
    let rotatedRect = cv.minAreaRect(contours.get(sortedContours[i][1]));

    let vertices = cv.RotatedRect.points(rotatedRect);

    for (let j = 0; j < 4; j++) {
      cv.line(
        dst,
        vertices[j],
        vertices[(j + 1) % 4],
        colors[i],
        2,
        cv.LINE_AA,
        0
      );
    }
  }

  let largestRoatedRectange = cv.minAreaRect(
    contours.get(sortedContours[0][1])
  );
  globalPoints = cv.RotatedRect.points(largestRoatedRectange);

  contours.delete();
  hierarchy.delete();
  mainSrc.delete();

  return dst;
};

// Editing canvas
function selectImage() {
  let points = globalPoints;

  let drag_point = -1;
  let pointSize = 6;
  let canvas = document.getElementById('canvasIntermediate');
  let bgImage = document.getElementById('canvasInput');
  var ctx = canvas.getContext('2d');

  canvas.onmousedown = function (e) {
    var pos = getPosition(e);
    drag_point = getPointAt(pos.x, pos.y);
  };
  canvas.onmousemove = function (e) {
    if (drag_point != -1) {
      var pos = getPosition(e);
      points[drag_point].x = pos.x;
      points[drag_point].y = pos.y;
      redraw();
    }
  };
  canvas.onmouseup = function (e) {
    drag_point = -1;
  };

  canvas.ontouchstart = function (e) {
    if (e.touches) e = e.touches[0];

    var pos = getPosition(e);
    drag_point = getPointAt(pos.x, pos.y);

    return false;
  };

  canvas.ontouchmove = function (e) {
    if (e.touches) e = e.touches[0];

    if (drag_point != -1) {
      var pos = getPosition(e);
      points[drag_point].x = pos.x;
      points[drag_point].y = pos.y;
      redraw();
    }

    return false;
  };

  canvas.ontouchend = function (e) {
    if (e.touches) e = e.touches[0];

    drag_point = -1;

    return false;
  };

  function getPosition(event) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    return { x, y };
  }

  function getPointAt(x, y) {
    for (var i = 0; i < points.length; i++) {
      if (
        Math.abs(points[i].x - x) < pointSize &&
        Math.abs(points[i].y - y) < pointSize
      )
        return i;
    }
    return -1;
  }

  function redraw() {
    if (points.length > 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      drawLines();
      drawCircles();

      globalPoints = points;
    }
  }

  function drawLines() {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    points.forEach((p) => {
      ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function drawCircles() {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 4;
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, pointSize, 0, Math.PI * 2, true);
      ctx.stroke();
    });
  }

  redraw();
}

function doPerspectiveTransform() {
  if (globalPoints == null) {
    return;
  }

  let mainSrc = cv.imread('canvasInput');
  let dst = new cv.Mat();

  //Order the corners
  let cornerArray = [
    { corner: globalPoints[0] },
    { corner: globalPoints[1] },
    { corner: globalPoints[2] },
    { corner: globalPoints[3] },
  ];
  //Sort by Y position (to get top-down)
  cornerArray
    .sort((item1, item2) => {
      return item1.corner.y < item2.corner.y
        ? -1
        : item1.corner.y > item2.corner.y
        ? 1
        : 0;
    })
    .slice(0, 5);

  //Determine left/right based on x position of top and bottom 2
  let tl =
    cornerArray[0].corner.x < cornerArray[1].corner.x
      ? cornerArray[0]
      : cornerArray[1];
  let tr =
    cornerArray[0].corner.x > cornerArray[1].corner.x
      ? cornerArray[0]
      : cornerArray[1];
  let bl =
    cornerArray[2].corner.x < cornerArray[3].corner.x
      ? cornerArray[2]
      : cornerArray[3];
  let br =
    cornerArray[2].corner.x > cornerArray[3].corner.x
      ? cornerArray[2]
      : cornerArray[3];

  //Calculate the max width/height
  let widthBottom = Math.hypot(
    br.corner.x - bl.corner.x,
    br.corner.y - bl.corner.y
  );
  let widthTop = Math.hypot(
    tr.corner.x - tl.corner.x,
    tr.corner.y - tl.corner.y
  );
  let theWidth = widthBottom > widthTop ? widthBottom : widthTop;
  let heightRight = Math.hypot(
    tr.corner.x - br.corner.x,
    tr.corner.y - br.corner.y
  );
  let heightLeft = Math.hypot(
    tl.corner.x - bl.corner.x,
    tr.corner.y - bl.corner.y
  );
  let theHeight = heightRight > heightLeft ? heightRight : heightLeft;

  //Transform!
  let finalDestCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    theWidth - 1,
    0,
    theWidth - 1,
    theHeight - 1,
    0,
    theHeight - 1,
  ]); //
  let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.corner.x,
    tl.corner.y,
    tr.corner.x,
    tr.corner.y,
    br.corner.x,
    br.corner.y,
    bl.corner.x,
    bl.corner.y,
  ]);
  let dsize = new cv.Size(theWidth, theHeight);
  let M = cv.getPerspectiveTransform(srcCoords, finalDestCoords);
  cv.warpPerspective(
    mainSrc,
    dst,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  document.getElementById('output-image').style.display = 'block';
  cv.imshow('canvasOutput', dst);

  mainSrc.delete();
  M.delete();
  dst.delete();
}

function downloadCroppedImage() {
  var link = document.createElement('a');

  link.download = 'cropped.png';
  link.href = document.getElementById('canvasOutput').toDataURL();
  link.click();
}
