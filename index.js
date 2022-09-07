function onOpenCvReady() {
  document.getElementById('status').innerHTML = 'OpenCV.js is ready.';
}

let imgElement = document.getElementById('canvasInput');
let inputElement = document.getElementById('fileInput');

inputElement.addEventListener(
  'change',
  (e) => {
    imgElement.src = URL.createObjectURL(e.target.files[0]);
    imgElement.style.display = 'block';
  },
  false
);

imgElement.onload = function () {
  let startTime = new Date();
  doGrayScaling();
  doBluring();
  doMorphing();
  doEdgeDetection();
  doContourDetection();
  doPerpectiveTransform();
  let stopTime = new Date();

  console.log((stopTime - startTime) / 1000 + ' seconds');
};

let mainContour;

function doGrayScaling() {
  let src = cv.imread('canvasInput');
  let dst = new cv.Mat();

  cv.cvtColor(src, dst, cv.COLOR_BGR2GRAY, 0);

  cv.imshow('canvasOutputG', dst);
  src.delete();
  dst.delete();
}

function doBluring() {
  let src = cv.imread('canvasOutputG');
  let dst = new cv.Mat();

  let ksize = new cv.Size(5, 5);
  // You can try more different parameters
  cv.GaussianBlur(src, dst, ksize, 0, 0, cv.BORDER_DEFAULT);
  //cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);
  cv.imshow('canvasOutputB', dst);
  src.delete();
  dst.delete();
}

function doMorphing() {
  let src = cv.imread('canvasOutputB');
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
  cv.imshow('canvasOutputM', dst);
  src.delete();
  dst.delete();
  M.delete();
}

function doEdgeDetection() {
  let src = cv.imread('canvasOutputM');
  let dst = new cv.Mat();
  cv.cvtColor(src, src, cv.COLOR_RGB2GRAY, 0);
  // You can try more different parameters
  cv.Canny(src, dst, 100, 200, 3, false);
  cv.imshow('canvasOutputE', dst);
  src.delete();
  dst.delete();
}

function doContourDetection() {
  let mainSrc = cv.imread('canvasInput');
  let src = cv.imread('canvasOutputE');
  let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);

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

  let contoursMetadata = [];

  for (let i = 0; i < contours.size(); ++i) {
    let rows = contours.get(i).rows;

    contoursMetadata.push([rows, i]);
  }

  contoursMetadata.sort((a, b) => {
    let i = b[0] - a[0];

    if (i == 0) {
      return a[1] - b[1];
    }

    return i;
  });

  if (contoursMetadata.length == 0) {
    alert('Image is invalid');
    return;
  }

  // draw contours with random Scalar
  for (let i = 0; i < 1; ++i) {
    let color = new cv.Scalar(
      Math.round(Math.random() * 255),
      Math.round(Math.random() * 255),
      Math.round(Math.random() * 255)
    );
    cv.drawContours(
      mainSrc,
      contours,
      contoursMetadata[i][1],
      color,
      5,
      cv.LINE_AA,
      hierarchy,
      100
    );
  }

  mainContour = contours.get(contoursMetadata[0][1]);

  cv.imshow('canvasOutputC', mainSrc);
  src.delete();
  dst.delete();
  contours.delete();
  hierarchy.delete();
  mainSrc.delete();
}

function doPerpectiveTransform() {
  if (mainContour == null) {
    return;
  }

  let src = cv.imread('canvasInput');
  let dst = new cv.Mat();

  let approx = new cv.Mat();
  cv.approxPolyDP(
    mainContour,
    approx,
    0.05 * cv.arcLength(mainContour, false),
    true
  );

  if (approx.rows == 4) {
    console.log('Found a 4-corner approx');
    foundContour = approx;
  } else {
    alert('Image is invalid');
    return;
  }

  //Find the corners
  //foundCountour has 2 channels (seemingly x/y), has a depth of 4, and a type of 12.  Seems to show it's a CV_32S "type", so the valid data is in data32S??
  let corner1 = new cv.Point(foundContour.data32S[0], foundContour.data32S[1]);
  let corner2 = new cv.Point(foundContour.data32S[2], foundContour.data32S[3]);
  let corner3 = new cv.Point(foundContour.data32S[4], foundContour.data32S[5]);
  let corner4 = new cv.Point(foundContour.data32S[6], foundContour.data32S[7]);

  //Order the corners
  let cornerArray = [
    { corner: corner1 },
    { corner: corner2 },
    { corner: corner3 },
    { corner: corner4 },
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
    src,
    dst,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  cv.imshow('canvasOutput', dst);
  src.delete();
  dst.delete();
  M.delete();
}
