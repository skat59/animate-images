/*!
 @its2easy/animate-images 2.3.1
 https://github.com/skat59/animate-images
         
 Copyright (c) 2020-present Dmitry Kovalev,
 Released under the MIT license
*/
function normalizeFrameNumber(frameNumber, totalImages){
    frameNumber = Math.floor(frameNumber);
    if (frameNumber <= 0) {
        return 1;
    } else if (frameNumber > totalImages) {
        return totalImages;
    }
    return frameNumber;
}

function uppercaseFirstChar(word){
    return word.charAt(0).toUpperCase() + word.slice(1);
}

function validateInitParameters(node, options){
    if ( !(node instanceof HTMLCanvasElement) ) { // Check dom node
        throw new TypeError('node is required and should be canvas element');
    }
    if (!options.images || !Array.isArray(options.images) || options.images.length <= 1 ) { // Check images list
        throw new TypeError('options.images is required and must be an array with more than 1 element');
    }
    // if ( ("preload" in options) && // Check preload type
    //     (
    //         !(typeof options.preload  === "string")
    //         || !(options.preload === "all" || options.preload === "none" || options.preload === "partial")
    //     )
    // ) {
    //     throw new TypeError('options.preload must be one of these: all, none, partial');
    // }
    // if ( ("preloadNumber" in options)
    //     && !( Number.isInteger(Number.parseInt(options.preloadNumber)) && Number.parseInt(options.preloadNumber) >= 0 )
    // ) {
    //     throw new TypeError('options.preloadNumber must be number >= 0');
    // }
    if ('preloadNumber' in options) options.preloadNumber = Number.parseInt(options.preloadNumber); // Allow number as a string
    if ("fillMode" in options && !['cover', 'contain'].includes(options.fillMode))  delete options['fillMode'];
    if ('dragModifier' in options) options.dragModifier = Math.abs(+options.dragModifier);
}

const defaultSettings = {
    preload: "all",
    preloadNumber: 0,
    poster: false,
    fps: 30,
    loop: false,
    autoplay: false,
    reverse: false,
    ratio: undefined,
    fillMode: "cover",

    draggable: false,
    inversion: false,
    dragModifier: 1,
    touchScrollMode: "pageScrollTimer",
    pageScrollTimerDelay: 1500,
    responsiveAspect: "width",

    fastPreview: false,

    onFastPreloadFinished: noOp,
    onPreloadFinished: noOp,
    onPosterLoaded: noOp,
    onAnimationEnd: noOp,
    onBeforeFrame: noOp,
    onAfterFrame: noOp,
};

const eventPrefix = "animate-images:";

function noOp(){}

class ImagePreloader{

    constructor( {settings, data, updateImagesCount, getFramesLeft} ) {
        this._settings = settings;
        this._data = data;
        this._updateImagesCount = updateImagesCount;
        this._getFramesLeft = getFramesLeft;

        // Public
        this._isPreloadFinished = false;// onload on all the images
        this._isFastPreloadFinished = false;// images from fastPreload mode
        this._isAnyPreloadFinished = false;
        this._isLoadedWithErrors = false;

        // Internal
        this._preloadOffset = 0;// images already in queue
        this._preloadedCount = 0;// count of loaded images
        this._tempImagesArray = []; // store images before they are fully loaded
        this._failedImages = [];
        this._currentMode = "default";// "default" or "fast"
        this._modes = {
            default: {
                images: this._settings.images,
                event: eventPrefix + "preload-finished",
                callback: this._settings.onPreloadFinished,
            },
            fast: {
                images: this._settings?.fastPreview.images,
                event: eventPrefix + "fast-preload-finished",
                callback: this._settings.onFastPreloadFinished,
            }
        };

        // set mode if fast preview
        if (this._settings.fastPreview) {
            if ( !this._settings.fastPreview.images ) {
                throw new TypeError('fastPreview.images is required when fastPreview is enabled');
            }
            this._currentMode = "fast";
            this._data.totalImages = this._settings.fastPreview.images.length;
        }
        this._totalImages = this._data.totalImages; // get initial value for the first time, update when fast => default mode
    }

    /**
     * Add number of images to loading queue
     * @param {number} [preloadNumber] - number of images to load
     */
    _startLoading(preloadNumber){
        if (this._isPreloadFinished) return;
        if ( !preloadNumber ) preloadNumber = this._totalImages;
        preloadNumber = Math.round(preloadNumber);

        // if too many, load just the rest
        const unloadedCount = this._totalImages - this._preloadOffset;
        if (preloadNumber > unloadedCount){
            preloadNumber = unloadedCount;
        }

        // true when all the images are in queue but not loaded yet, (unloadedCount = preloadNumber = 0)
        if (preloadNumber <= 0) return;

        //console.log(`start loop, preloadNumber=${preloadNumber}, offset=${this._preloadOffset}`);
        for (let i = this._preloadOffset; i < (preloadNumber + this._preloadOffset); i++){
            let img = new Image();
            img.onload = img.onerror = this.#onImageLoad.bind(this);
            img.src = this._modes[this._currentMode].images[i];
            this._tempImagesArray[i] = img;
        }
        this._preloadOffset = this._preloadOffset + preloadNumber;
    }

    #onImageLoad(e){
        this._preloadedCount++;
        const progress = Math.floor((this._preloadedCount/this._totalImages) * 1000) / 1000 ;
        this._data.canvas.element.dispatchEvent( new CustomEvent(eventPrefix + 'loading-progress', {detail: {progress}}) );
        if (e.type === "error") {
            this._isLoadedWithErrors = true;
            const path = e.path || (e.composedPath && e.composedPath());
            this._failedImages.push(path[0]);
            this._data.canvas.element.dispatchEvent( new Event(eventPrefix + 'loading-error') );
        }
        if (this._preloadedCount >= this._totalImages) {
            if ( this._isLoadedWithErrors ) this.#clearImagesArray();
            this.#afterPreloadFinishes();
        }
    }

    /**
     * Remove failed images from array
     */
    #clearImagesArray(){
        if ( this._failedImages.length < 1) return;
        this._tempImagesArray = this._tempImagesArray.filter((el) => {
            return !this._failedImages.includes(el);
        });
    }

    #afterPreloadFinishes(){ // check what to do next
        if (this._currentMode === "default"){
            this._isPreloadFinished = true;
        } else {
            this._isFastPreloadFinished = true;
        }
        this._isAnyPreloadFinished = true; // variable for checks from main plugin
        this._data.loadedImagesArray = [...this._tempImagesArray];
        this._data.totalImages = this._tempImagesArray.length;
        this._updateImagesCount();

        // we should call deferredAction and callback after "setFrame" inside next "if", because setFrame will replace
        // these actions, so save current mode before it will be changed inside "if", and use for  deferredAction and callback
        const savedMode = this._currentMode;
        const plugin = this._data.pluginApi;
        // code below executes only if fastPreview is set
        if ( this._currentMode === "fast" ) { // fast preload has ended
            this._currentMode = "default";
            this._tempImagesArray = [];
            this._preloadOffset = this._preloadedCount = 0;
            this._totalImages = this._settings.images.length; // update for default preload mode
            // start preload full list if we have action, that started after fast preload end
            if ( this._data.deferredAction ) this._startLoading();
        } else if ( this._currentMode === "default" && this._settings.fastPreview ) { // default preload has ended (only after fast),
            // replace small sequence with full and change frame
            if (this._settings?.fastPreview.fpsAfter) plugin.setOption("fps", this._settings?.fastPreview.fpsAfter);
            const wasAnimating = plugin.isAnimating();
            const framesAreInQueue = typeof this._getFramesLeft() !== 'undefined'; // true if playTo or playFrames is active
            const matchFrame = this._settings?.fastPreview.matchFrame;
            plugin.setFrame( matchFrame ? matchFrame(this._data.currentFrame) : 1 );
            // play() => continue, playTo() or playFrames() => stop, because it is impossible
            // to calculate new target frame from _framesLeftToPlay
            //https://github.com/its2easy/animate-images/issues/7#issuecomment-1210624687
            if ( wasAnimating && !framesAreInQueue ) plugin.play();
        }

        // actions and callbacks
        if (this._data.deferredAction) {
            this._data.deferredAction();
            // clear to prevent from being called twice when action was queued before the end of fastPreview preload
            this._data.deferredAction = null;
        }
        this._data.canvas.element.dispatchEvent( new Event(this._modes[savedMode].event) );
        this._modes[savedMode].callback(plugin);

    }

    // Case when fast preload had ended, but we don't have deferred action, because action started with preview frames,
    // this is possible only with preload="all"; or with any preload after plugin.preloadImages() before any action,
    // and we have to start full preload here.
    // This function is called only after frame change was requested.
    _maybePreloadAll(){
        if (this._settings.fastPreview && !this._isPreloadFinished) this._startLoading();
    }

}

class Render{

    constructor( {settings, data} ) {
        this._settings = settings;
        this._data = data;
        /** @type CanvasRenderingContext2D */
        this._context = this._data.canvas.element.getContext("2d");
    }

    /**
     * @param {HTMLImageElement} imageObject - image object
     */
    _drawFrame(imageObject){
        //this._context.imageSmoothingEnabled = false; // may reduce blurriness, but could make the image worse (resets to true  after resize)

        let sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight;
        if (this._settings.fillMode === "cover") {
            ( {sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight} = this.#getDrawImageCoverProps(imageObject) );
        } else if ( this._settings.fillMode === "contain" ) {
            ( {sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight} = this.#getDrawImageContainProps(imageObject) );
        }

        //console.log(`sx= ${sx}, sy=${sy}, sWidth=${sWidth}, sHeight=${sHeight}, dx=${dx}, dy=${dy}, dWidth=${dWidth}, dHeight=${dHeight}`);
        const canvasEl = this._data.canvas.element;
        this._settings.onBeforeFrame(this._data.pluginApi,
            {context: this._context, width: canvasEl.width, height: canvasEl.height});

        this._context.drawImage(imageObject, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

        this._settings.onAfterFrame(this._data.pluginApi,
            {context: this._context, width: canvasEl.width, height: canvasEl.height});
    }

    _clearCanvas(){
        const canvasEl = this._data.canvas.element;
        this._context.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }

    #getDrawImageCoverProps(image){
        //https://stackoverflow.com/questions/21961839/simulation-background-size-cover-in-canvas
        let dx = 0,
            dy = 0,
            canvasWidth = this._data.canvas.element.width,
            canvasHeight = this._data.canvas.element.height,
            imageWidth = image.naturalWidth,
            imageHeight = image.naturalHeight,
            offsetX = 0.5,
            offsetY = 0.5,
            minRatio = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight),
            newWidth = imageWidth * minRatio,   // new prop. width
            newHeight = imageHeight * minRatio,   // new prop. height
            sx, sy, sWidth, sHeight, ar = 1;

        // decide which gap to fill
        if (newWidth < canvasWidth) ar = canvasWidth / newWidth;
        if (Math.abs(ar - 1) < 1e-14 && newHeight < canvasHeight) ar = canvasHeight / newHeight;  // updated
        newWidth *= ar;
        newHeight *= ar;

        // calc source rectangle
        sWidth = imageWidth / (newWidth / canvasWidth);
        sHeight = imageHeight / (newHeight / canvasHeight);

        sx = (imageWidth - sWidth) * offsetX;
        sy = (imageHeight - sHeight) * offsetY;

        // make sure source rectangle is valid
        if (sx < 0) sx = 0;
        if (sy < 0) sy = 0;
        if (sWidth > imageWidth) sWidth = imageWidth;
        if (sHeight > imageHeight) sHeight = imageHeight;

        return { sx, sy, sWidth, sHeight, dx, dy, dWidth: canvasWidth, dHeight: canvasHeight };
    }
    #getDrawImageContainProps(image){
        let canvasWidth = this._data.canvas.element.width,
            canvasHeight = this._data.canvas.element.height,
            imageWidth = image.naturalWidth,
            imageHeight = image.naturalHeight,
            sx = 0,
            sy = 0,
            sWidth = imageWidth,
            sHeight = imageHeight,
            dx,
            dy,
            offsetX = 0.5,
            offsetY = 0.5,
            ratioX = canvasWidth / imageWidth,
            ratioY = canvasHeight / imageHeight,
            minRation = Math.min(ratioX, ratioY),
            newWidth = imageWidth * minRation,
            newHeight = imageHeight * minRation;

        dx = (canvasWidth - newWidth) * offsetX;
        dy = (canvasHeight - newHeight) * offsetY;

        return { sx, sy, sWidth, sHeight, dx, dy, dWidth: newWidth, dHeight: newHeight};
    }
}

class Animation{
    // Public
    _isAnimating;
    _framesLeftToPlay; // frames from playTo() and playFrames()

    // Internal
    _lastUpdate; // time from RAF
    _duration; // time of the full animation sequence
    _stopRequested;
    _framesQueue; // save decimal part if deltaFrames is not round, to prevent rounding errors
    _progressThreshold; // >35% mea`ns that there was a long task in callstack

    constructor( {settings, data, changeFrame} ) {
        this._settings = settings;
        this._data = data;
        this._changeFrame = changeFrame;

        this._stopRequested = false;
        this._isAnimating = false;
        this._framesQueue = 0;
        this._progressThreshold = 0.35;

        this._updateDuration();
    }

    _play(){
        this._isAnimating = true;
         this._stopRequested = false; // fix for the case when stopRequested was set inside getNextFrame that was called outside #animate
        if ( !this._data.isAnyFrameChanged ) { // 1st paint, direct call because 1st frame wasn't drawn
            this._changeFrame(1);
            // subtract 1 manually, because changeFrame is calling not from animate(), but directly
            if ( Number.isFinite(this._framesLeftToPlay) ) this._framesLeftToPlay--; // undefined-- = NaN
        }

         this._lastUpdate = null;// first 'lastUpdate' should be always set in the first raf of the current animation
        requestAnimationFrame(this.#animate.bind(this));
    }
    _stop(){
        const wasAnimating = this._isAnimating;
        this._isAnimating = false;
        this._framesLeftToPlay = undefined;
        if ( wasAnimating ){ // !!! callbacks and events should be called after all the values are reset
            this._data.canvas.element.dispatchEvent( new Event(eventPrefix + 'animation-end') );
            this._settings.onAnimationEnd(this._data.pluginApi);
        }
    }

    /**
     * Get next frame number, based on current state and settings
     * @param {Number} deltaFrames -
     * @param {Boolean} reverse
     * @returns {number|*}
     */
    _getNextFrame(deltaFrames, reverse = undefined){
        deltaFrames = Math.floor(deltaFrames); //just to be safe
        // Handle reverse
        if ( reverse === undefined ) reverse = this._settings.reverse;
        let newFrameNumber = reverse ? this._data.currentFrame - deltaFrames : this._data.currentFrame + deltaFrames;

        // Handle loop
        if (this._settings.loop) { // loop and outside of the frames
            if (newFrameNumber <= 0) {
                // for example newFrame = -2, total = 50, newFrame = 50 - abs(-2) = 48
                newFrameNumber = this._data.totalImages - Math.abs(newFrameNumber);
            }
            else if (newFrameNumber > this._data.totalImages) {
                // for example newFrame = 53, total 50, newFrame = newFrame - totalFrames = 53 - 50 = 3
                newFrameNumber = newFrameNumber - this._data.totalImages;
            }
        } else { // no loop and outside of the frames
            if (newFrameNumber <= 0) {
                newFrameNumber = 1;
                this._stopRequested = true;
            }
            else if (newFrameNumber > this._data.totalImages) {
                newFrameNumber = this._data.totalImages;
                 this._stopRequested = true;
            }
        }
        return  newFrameNumber;
    }

    // RAF callback
    // (chrome) 'timestamp' is timestamp from the moment the RAF callback was queued
    // (firefox) 'timestamp' is timestamp from the moment the RAF callback was called
    // the difference is equal to the time that the main thread was executing after raf callback was queued
    #animate(timestamp){
        if ( !this._isAnimating ) return;

        // lastUpdate is setting here because the time between play() and #animate() is unpredictable, and
        // lastUpdate = performance.now instead of timestamp because timestamp is unpredictable and depends on the browser.
        // Possible frame change in the first raf will always be skipped, because time <= performance.now
        if ( ! this._lastUpdate)  this._lastUpdate = performance.now();

        let deltaFrames;
        // Check if there was a long task between this and the last frame, if so move 1 fixed frame and change lastUpdate to now
        // to prevent animation jump. (1,2,3,long task,75,76,77, ... => 1,2,3,long task,4,5,6,...)
        // In this case the duration will be longer
        let isLongTaskBeforeRaf = (Math.abs(timestamp - performance.now()) /  this._duration) >  this._progressThreshold; //chrome check
        let progress = ( timestamp -  this._lastUpdate ) /  this._duration; // e.g. 0.01
        if ( progress >  this._progressThreshold ) isLongTaskBeforeRaf = true; // firefox check

        if (isLongTaskBeforeRaf) deltaFrames = 1; // raf after long task, just move to the next frame
        else { // normal execution, calculate progress after the last frame change
            if (progress < 0) progress = 0; //it happens sometimes, when raf timestamp is from the past for some reason
            deltaFrames = progress * this._data.totalImages; // Frame change step, e.g. 0.45 or 1.25
            // e.g. progress is 0.8 frames, queue is 0.25 frames, so now deltaFrames is 1.05 frames and we need to update canvas,
            // without this raf intervals will cause cumulative rounding errors, and actual fps will decrease
            deltaFrames = deltaFrames +  this._framesQueue;
        }

        // calculate next frame only when we want to render
        // if the getNextFrame check was outside, getNextFrame would be called at screen fps rate, not animation fps
        // if screen fps 144 and animation fps 30, getNextFrame is calling now 30/s instead of 144/s.
        // After the last frame, raf is repeating until the next frame calculation,
        // between the last frame drawing and new frame time, reverse or loop could be changed, and animation won't stop
        if ( deltaFrames >= 1) { // Calculate only if we need to update 1 frame or more
            const newLastUpdate = isLongTaskBeforeRaf ? performance.now() : timestamp;

            this._framesQueue = deltaFrames % 1; // save decimal part for the next RAFs
            deltaFrames = Math.floor(deltaFrames) % this._data.totalImages;
            if ( deltaFrames > this._framesLeftToPlay ) deltaFrames = this._framesLeftToPlay;// case when  animation fps > device fps
            const newFrame = this._getNextFrame( deltaFrames );
            if ( this._stopRequested ) { // animation ended from check in getNextFrame()
                this._data.pluginApi.stop();
                this._stopRequested = false;
                if (this._data.pluginApi.getCurrentFrame() !== newFrame ) this._changeFrame(newFrame); //last frame fix if fps > device fps
            } else { // animation is on
                this._lastUpdate = newLastUpdate;
                this._changeFrame(newFrame);
                if (typeof this._framesLeftToPlay !== 'undefined') {
                    this._framesLeftToPlay = this._framesLeftToPlay - deltaFrames;
                    // if 0 frames left, stop immediately, don't wait for the next frame calculation
                    // because if isAnimating become true, this will be a new animation
                    if ( this._framesLeftToPlay <= 0 ) this._data.pluginApi.stop();
                }
            }
        }
        if ( this._isAnimating ) requestAnimationFrame(this.#animate.bind(this));
    }

    /**
     * Recalculate animation duration after fps or totalImages change
     */
    _updateDuration(){
         this._duration =  this._data.totalImages / this._settings.fps  * 1000;
    }
}

class Poster{
    // Internal
    _imageObject;
    _isPosterLoaded;

    constructor({settings, data, drawFrame}) {
        this._settings = settings;
        this._data = data;
        this._drawFrame = drawFrame;

        this._isPosterLoaded = false;
    }

    /**
     * Start loading poster, then  show if needed
     */
    _loadAndShowPoster(){
        if (this._settings.poster && !this._data.isAnyFrameChanged) {
            this._imageObject = new Image();
            this._imageObject.onload = this._imageObject.onerror = this.#onPosterLoaded.bind(this);
            this._imageObject.src = this._settings.poster;
        }
    }

    /**
     * Redraw poster after canvas change if the poster was loaded
     */
    _redrawPoster(){
        if ( this._data.isAnyFrameChanged || !this._isPosterLoaded ) return;
        this.#drawPoster();
    }

    #onPosterLoaded(e){
        if (e.type === "error") return;
        this._isPosterLoaded = true;
        this._data.canvas.element.dispatchEvent( new Event(eventPrefix + 'poster-loaded') );
        this._settings.onPosterLoaded(this._data.pluginApi);
        // show only if there wasn't any frame change from initial
        // if poster loaded after all the images and any action, it won't be shown
        if ( !this._data.isAnyFrameChanged ) {
            this.#drawPoster();
        }
    }

    #drawPoster(){
        this._drawFrame(this._imageObject);
    }
}

class DragInput{
    // Public
    _isSwiping = false;

    // Internal
    _curX;
    _curY;
    _prevX;
    _prevY;
    _threshold;
    _pixelsCorrection;
    _lastInteractionTime;
    _prevDirection;

    constructor({ data, settings, changeFrame, getNextFrame }) {
        this._data = data;
        this._settings = settings;
        this._changeFrame = changeFrame;
        this._getNextFrame = getNextFrame;

        this._SWIPE_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'touchcancel'];
        this._isSwiping = false;
        this._boundSwipeHandler = this.#swipeHandler.bind(this);
        this._pixelsCorrection = 0;

        this._updateThreshold();
    }

    /**
     * Enable rotating by mouse or touch drag
     */
    _enableDrag(){
        this._SWIPE_EVENTS.forEach( (value) => {
            this._data.canvas.element.addEventListener(value, this._boundSwipeHandler);
        });
    }

    /**
     * Disable rotating by mouse or touch drag
     */
    _disableDrag(){
        this._SWIPE_EVENTS.forEach( (value) => {
            this._data.canvas.element.removeEventListener(value, this._boundSwipeHandler);
        });
        // if disabling while swipeMove is running
        document.removeEventListener('mouseup', this._boundSwipeHandler);
        document.removeEventListener('mousemove', this._boundSwipeHandler);
        this._data.canvas.element.style.cursor = null;
    }

    /**
     * Update one frame threshold in pixels
     * @param newValue
     */
    _updateThreshold(newValue = null){
        if (newValue) {
            this._threshold = newValue;
        }
        else {
            this._threshold = this._data.canvas.element.clientWidth / this._data.totalImages;
        }
    }


    #swipeHandler(event) {
        // get current click/touch point
        let touches;
        if ( event.touches !== undefined && event.touches.length ) touches = event.touches;
        this._curX = (touches) ? touches[0].pageX : event.clientX;
        this._curY = (touches) ? touches[0].pageY : event.clientY;

        switch (event.type){
            case 'mousedown': // start
            case 'touchstart':
                if ( event.type === 'touchstart' && event.cancelable ) {
                    //event.preventDefault();
                    this.#maybeDisableScroll(event);
                }
                document.addEventListener('mouseup', this._boundSwipeHandler); // move outside of the canvas
                document.addEventListener('mousemove', this._boundSwipeHandler);
                this.#swipeStart();
                break;
            case 'mousemove':
            case 'touchmove': //move
                // ignore mousemove without move (to prevent fake "left" movement)
                const wasMoved = (this._prevX !== this._curX && this._prevY !== this._curX);
                if ( this._isSwiping && wasMoved) {
                    //if ( event.type === 'touchmove' && event.cancelable) event.preventDefault();
                    this.#swipeMove();
                }
                break;
            case 'mouseup':
            case 'touchend':
            case 'touchcancel': // end
                //if ( (event.type === 'touchend' || event.type === 'touchcancel') && event.cancelable) event.preventDefault();
                if ( this._isSwiping ) {
                    document.removeEventListener('mouseup', this._boundSwipeHandler);
                    document.removeEventListener('mousemove', this._boundSwipeHandler);
                    this.#swipeEnd();
                }
                break;
        }
    }
    #swipeStart(){
        const plugin = this._data.pluginApi;
        if ( !(plugin.isFastPreloadFinished() || plugin.isPreloadFinished()) ) return;
        // trigger full load after user interaction after fast preload finished
        if (this._settings.fastPreview && !plugin.isPreloadFinished() && plugin.isFastPreloadFinished()) {
            plugin.preloadImages();
        }
        plugin.stop();
        this._isSwiping = true;
        this._data.canvas.element.style.cursor = 'grabbing';
        this._prevX = this._curX;
        this._prevY = this._curY;
        this._data.canvas.element.dispatchEvent( new CustomEvent(eventPrefix + 'drag-start',
            { detail: {frame: this._data.currentFrame} })
        );
    }
    #swipeMove(){
        const direction = this.#swipeDirection();
        if (this._prevDirection && this._prevDirection !== direction) { // reset after direction change
            this._pixelsCorrection = 0;
        }
        this._prevDirection = direction;

        const pixelDiffX = Math.abs(this._curX - this._prevX ); // save x diff before update
        const swipeLength = (pixelDiffX + this._pixelsCorrection) * this._settings.dragModifier ;

        this._prevX = this._curX; // update before any returns
        this._prevY = this._curY; // update Y to prevent wrong angle after many vertical moves


        if ( (direction !== 'left' && direction !== 'right') || // Ignore vertical directions
            (swipeLength < this._threshold) ) { // Ignore if less than 1 frame
            this._pixelsCorrection += pixelDiffX; // skip this mousemove, but save horizontal movement
            return;
        }


        const progress = swipeLength / this._data.canvas.element.clientWidth; // full width swipe means full length animation
        let deltaFrames = Math.floor(progress * this._data.totalImages);
        deltaFrames = deltaFrames % this._data.totalImages;
        // Add pixels to the next swipeMove if frames equivalent of swipe is not an integer number,
        // e.g one frame is 10px, swipeLength is 13px, we change 1 frame and add 3px to the next swipe,
        // so fullwidth swipe is always rotate sprite for 1 turn (with 'dragModifier' = 1).
        // I divide the whole value by dragModifier because it seems to work as it should
        this._pixelsCorrection = (swipeLength - (this._threshold * deltaFrames)) / this._settings.dragModifier;
        let isReverse = (direction === 'left'); // left means backward (reverse: true)
        if (this._settings.inversion) isReverse = !isReverse;// invert direction
        this._changeFrame(this._getNextFrame( deltaFrames, isReverse )); // left means backward (reverse: true)
        this._data.canvas.element.dispatchEvent( new CustomEvent(eventPrefix + 'drag-change',
            { detail: {
                frame: this._data.currentFrame,
                direction,
            } })
        );
    }
    #swipeEnd(){
        //if ( swipeObject.curX === undefined ) return; // there is no x coord on touch end
        this._curX = this._curY = this._prevX = this._prevY = null;
        this._isSwiping = false;
        this._data.canvas.element.style.cursor = null;
        this._lastInteractionTime = new Date().getTime();
        this._data.canvas.element.dispatchEvent( new CustomEvent(eventPrefix + 'drag-end',
            { detail: {
                frame: this._data.currentFrame,
                direction: this._prevDirection,
            } })
        );
    }
    #swipeDirection(){
        let r, swipeAngle,
            xDist = this._prevX - this._curX,
            yDist = this._prevY - this._curY;

        // taken from slick.js
        r = Math.atan2(yDist, xDist);
        swipeAngle = Math.round(r * 180 / Math.PI);
        if (swipeAngle < 0) swipeAngle = 360 - Math.abs(swipeAngle);

        if ( (swipeAngle >= 0 && swipeAngle <= 60) || (swipeAngle <= 360 && swipeAngle >= 300 )) return 'left';
        else if ( swipeAngle >= 120 && swipeAngle <= 240 ) return 'right';
        else if ( swipeAngle >= 241 && swipeAngle <= 299 ) return 'bottom';
        else return 'up';
    }

    /**
     * Idea from https://github.com/giniedp/spritespin/blob/master/src/plugins/input-drag.ts#L45
     * @param {Event} event
     */
    #maybeDisableScroll(event){
        // always prevent
        if (this._settings.touchScrollMode === "preventPageScroll") event.preventDefault();
        // check timer
        if (this._settings.touchScrollMode === "pageScrollTimer") {
            const now = new Date().getTime();
            // less time than delay => prevent page scroll
            if (this._lastInteractionTime && (now - this._lastInteractionTime < this._settings.pageScrollTimerDelay) ){
                event.preventDefault();
            } else { // more time than delay or first interaction => clear timer
                this._lastInteractionTime = null;
            }
        }
        // if touchScrollMode="allowPageScroll" => don't prevent scroll
    }
}

/**
 * Animate Images {@link https://github.com/its2easy/animate-images/}
 * @example
 * let pluginInstance = new AnimateImages(document.querySelector('canvas'), {
 *    images: ['img1.jpg', 'img2.jpg', 'img3.jpg'],
 *    loop: true,
 *    draggable: true,
 *    fps: 60,
 * });
 */
class AnimateImages{
    #settings;
    #data = {
        currentFrame: 1,
        totalImages: null,
        loadedImagesArray: [], // images objects [0 - (images.length-1)]
        deferredAction: null, // call after full preload
        isAnyFrameChanged: false,
        /** @type AnimateImages */
        pluginApi: undefined,
        canvas: {
            element: null,
            ratio: null,
        },
    }
    #boundUpdateCanvasSizes;
    //Classes
    #preloader;
    #render;
    #animation;
    #poster;
    #dragInput;

    /**
     * Creates plugin instance
     * @param {HTMLCanvasElement} node - canvas element
     * @param {PluginOptions} options
     */
    constructor(node, options){
        validateInitParameters(node, options);
        this.#settings = {...defaultSettings, ...options};
        this.#data.totalImages = this.#settings.images.length;
        this.#data.canvas.element = node;
        this.#data.pluginApi = this;
        this.#boundUpdateCanvasSizes = this.#updateCanvasSizes.bind(this);
        this.#initPlugin();
    }

    #initPlugin(){
        this.#render = new Render( {settings: this.#settings, data: this.#data} );
        this.#animation = new Animation(
            {settings: this.#settings, data: this.#data, changeFrame:  this.#changeFrame.bind(this)} );
        this.#updateCanvasSizes();
        if ( this.#settings.poster ) this.#setupPoster();
        this.#toggleResizeHandler(true);
        this.#preloader = new ImagePreloader({
            settings: this.#settings,
            data: this.#data,
            updateImagesCount: this.#updateImagesCount.bind(this),
            getFramesLeft: this.#getFramesLeft.bind(this),
        });
        if (this.#settings.preload === 'all' || this.#settings.preload === "partial"){
            let preloadNumber = (this.#settings.preload === 'all') ? this.#data.totalImages : this.#settings.preloadNumber;
            if (preloadNumber === 0) preloadNumber = this.#data.totalImages;
            this.#preloader._startLoading(preloadNumber);
        }
        if (this.#settings.autoplay) this.play();
        if ( this.#settings.draggable ) this.#toggleDrag(true);
    }

    #changeFrame(frameNumber){
        if (frameNumber === this.#data.currentFrame && this.#data.isAnyFrameChanged) return;//skip same frame, except first drawing
        if ( !this.#data.isAnyFrameChanged ) this.#data.isAnyFrameChanged = true;

        this.#animateCanvas(frameNumber);
        this.#data.currentFrame = frameNumber;
    }

    #animateCanvas(frameNumber){
        this.#render._clearCanvas();
        this.#render._drawFrame( this.#data.loadedImagesArray[frameNumber - 1] );
    }


    #updateCanvasSizes(){
        const canvas = this.#data.canvas;
        /**
         * +++RATIO SECTION+++
         * If no options.ratio, inline canvas width/height will be used (2:1 if not set)
         * Real canvas size is controlled by CSS, inner size will be set based on CSS width and ratio (height should be "auto")
         * If height if fixed in CSS, ratio can't be used and inner height will be equal to CSS-defined height
         */
        if ( this.#settings.ratio ) canvas.ratio = this.#settings.ratio;
        // Initial ratio shouldn't be changed. Ratio will only modified after setOption("ratio", newRatio),
        // or after setting css height and plugin.updateCanvas()
        else if ( !canvas.ratio ) {
            canvas.ratio = canvas.element.width / canvas.element.height;
        }


        // +++SIZE SECTION+++
        // mainSide is the side from responsiveAspect, it should be controlled by CSS, secondarySide value will be
        // controlled by script
        const dpr = (window.devicePixelRatio).toFixed(2) || 1; // sometimes dpr is like 2.00000000234
        let mainSide = this.#settings.responsiveAspect;// width or height
        let clientMainSide =  "client" + uppercaseFirstChar(mainSide); // clientWidth or clientHeight
        let secondarySide = (mainSide === "width") ? "height" : "width";
        let clientSecondarySide = "client" + uppercaseFirstChar(secondarySide);// clientWidth or clientHeight

        // changing width and height won't change real clientWidth and clientHeight if size is fixed by CSS
        const initialClientMainSide = canvas.element[clientMainSide];
        canvas.element[mainSide] = canvas.element[clientMainSide] * dpr;

        // !!! ONLY if dpr != 1 and canvas css mainSide was not defined => changed width will change clientWidth
        // so we need to recalculate width based on new clientWidth
        if (initialClientMainSide !== canvas.element[clientMainSide]) {
            canvas.element[mainSide] = canvas.element[clientMainSide] * dpr;
        }

        let rawNewValue = (mainSide === "width") ? canvas.element.clientWidth / canvas.ratio : canvas.element.clientHeight * canvas.ratio;
        canvas.element[secondarySide] = Math.round(rawNewValue) * dpr; // "round" for partial fix to rounding pixels error


        // +++CORRECTION SECTION+++
        const secondaryValueDifference = Math.abs(canvas.element[secondarySide] - canvas.element[clientSecondarySide] * dpr);// diff in pixels
        // previously I compared with 1px to check subpixel errors, but error is somehow related to dpr, so we compare with "1px * dpr" or just "dpr"
        if ( secondaryValueDifference > dpr) { // if secondarySide is locked by CSS
            let newRatio = canvas.element.clientWidth / canvas.element.clientHeight; // ratio from "real" canvas element
            // <1% change => calculation error; >1% change => secondarySide size is locked with css
            if ( Math.abs(canvas.ratio - newRatio) / canvas.ratio > 0.01 ) {
                canvas.element[secondarySide] = canvas.element[clientSecondarySide] * dpr;
                canvas.ratio = newRatio;
            } else { // small diff between inner and real values, adjust to prevent errors accumulation
                canvas.element[secondarySide] = (mainSide === "width") ? canvas.element.width / canvas.ratio : canvas.element.height * canvas.ratio;
            }
        } else if (secondaryValueDifference > 0 && secondaryValueDifference <= dpr ) { // rare case, pixels are fractional
            // so just update inner canvas size baser on main side and ratio
            canvas.element[secondarySide] = (mainSide === "width") ? canvas.element.width / canvas.ratio : canvas.element.height * canvas.ratio;
        }

        if ( this.#dragInput ) this.#dragInput._updateThreshold();
        this.#maybeRedrawFrame(); // canvas is clear after resize
    }

    #updateImagesCount(){
        if ( this.#dragInput ) this.#dragInput._updateThreshold();
        this.#animation._updateDuration();
    }
    #maybeRedrawFrame(){
        if ( this.#data.isAnyFrameChanged ) { // frames were drawn
            this.#animateCanvas(this.#data.currentFrame);
        } else if ( this.#poster ) { // poster exists
            this.#poster._redrawPoster();
        }
        // don't redraw in initial state, or if poster onLoad is not finished yet
    }

    #toggleDrag(enable){
        if (enable) {
            if ( !this.#dragInput ) this.#dragInput = new DragInput({
                data: this.#data,
                settings: this.#settings,
                changeFrame: this.#changeFrame.bind(this),
                getNextFrame: this.#animation._getNextFrame.bind(this.#animation)
            });
            this.#dragInput._enableDrag();
        } else {
            if (this.#dragInput) this.#dragInput._disableDrag();
        }
    }

    #setupPoster(){
        if (!this.#poster) this.#poster = new Poster(
            {
                settings: this.#settings,
                data: this.#data,
                drawFrame: this.#render._drawFrame.bind(this.#render)
            });
        this.#poster._loadAndShowPoster();
    }

    #toggleResizeHandler(add = true) {
        if ( add ) window.addEventListener("resize", this.#boundUpdateCanvasSizes);
        else window.removeEventListener("resize", this.#boundUpdateCanvasSizes);
    }

    #getFramesLeft(){
        return this.#animation._framesLeftToPlay;
    }

    // Pubic API

    /**
     * Start animation
     * @returns {AnimateImages} - plugin instance
     */
    play(){
        if ( this.#animation._isAnimating ) return this;
        if ( this.#preloader._isAnyPreloadFinished ) {
            this.#animation._play();
            this.#preloader._maybePreloadAll();
        } else {
            this.#data.deferredAction = this.play.bind(this);
            this.#preloader._startLoading();
        }
        return this;
    }
    /**
     * Stop animation
     * @returns {AnimateImages} - plugin instance
     */
    stop(){
        this.#animation._stop();
        return this;
    }
    /**
     * Toggle between start and stop
     * @returns {AnimateImages} - plugin instance
     */
    toggle(){
        if ( !this.#animation._isAnimating ) this.play();
        else this.stop();
        return this;
    }
    /**
     * Show next frame
     * @returns {AnimateImages} - plugin instance
     */
    next(){
        if ( this.#preloader._isAnyPreloadFinished ) {
            this.stop();
            this.#changeFrame( this.#animation._getNextFrame(1) );
            this.#preloader._maybePreloadAll();
        } else {
            this.#data.deferredAction = this.next.bind(this);
            this.#preloader._startLoading();
        }
        return this;
    }
    /**
     * Show previous frame
     * @returns {AnimateImages} - plugin instance
     */
    prev(){
        if ( this.#preloader._isAnyPreloadFinished ) {
            this.stop();
            this.#changeFrame( this.#animation._getNextFrame(1, !this.#settings.reverse) );
            this.#preloader._maybePreloadAll();
        } else {
            this.#data.deferredAction = this.prev.bind(this);
            this.#preloader._startLoading();
        }
        return this;
    }
    /**
     * Show a frame with a specified number (without animation)
     * @param {number} frameNumber - Number of the frame to show
     * @returns {AnimateImages} - plugin instance
     */
    setFrame(frameNumber){
        if ( this.#preloader._isAnyPreloadFinished ) {
            this.stop();
            this.#changeFrame(normalizeFrameNumber(frameNumber, this.#data.totalImages));
            this.#preloader._maybePreloadAll();
        } else {
            this.#data.deferredAction = this.setFrame.bind(this, frameNumber);
            this.#preloader._startLoading();
        }
        return this;
    }
    /**
     * Start animation, that plays until the specified frame number
     * @param {number} frameNumber - Target frame number
     * @param {Object} [options] - Options
     * @param {boolean} [options.shortestPath=false] - If set to true and loop enabled, will use the shortest path
     * @returns {AnimateImages} - plugin instance
     */
    playTo(frameNumber, options){
        frameNumber = normalizeFrameNumber(frameNumber, this.#data.totalImages);

        const innerPathDistance = Math.abs(frameNumber - this.#data.currentFrame), // not crossing edge frames
            outerPathDistance = this.#data.totalImages - innerPathDistance, // crossing edges frames
            shouldUseOuterPath = this.#settings.loop && options?.shortestPath && (outerPathDistance < innerPathDistance);

        if ( !shouldUseOuterPath ) { // Inner path (default)
            // long conditions to make them more readable
            if (frameNumber > this.#data.currentFrame) this.setReverse(false); // move forward
            else this.setReverse(true); // move backward
        } else { // Outer path
            if (frameNumber < this.#data.currentFrame) this.setReverse(false); // move forward
            else this.setReverse(true); // move backward
        }

        return this.playFrames( (shouldUseOuterPath) ? outerPathDistance : innerPathDistance );
    }
    /**
     * Start animation in the current direction with the specified number of frames in the queue
     * @param {number} [numberOfFrames=0] - Number of frames to play
     * @returns {AnimateImages} - plugin instance
     */
    playFrames(numberOfFrames = 0){
        if ( this.#preloader._isAnyPreloadFinished ) {
            numberOfFrames = Math.floor(numberOfFrames);
            if (numberOfFrames < 0) { // first frame should be rendered to replace poster or transparent bg, so allow 0 for the first time
                return this.stop(); //empty animation, stop() to trigger events and callbacks
            }

            // if this is the 1st animation, we should add 1 frame to the queue to draw the 1st initial frame
            // because 1st frame is not drawn by default (1 frame will replace poster or transparent bg)
            if (!this.#data.isAnyFrameChanged) numberOfFrames += 1;
            if (numberOfFrames <= 0) { // with playFrames(0) before any actions numberOfFrames=1, after any frame change numberOfFrames=0
                return this.stop(); //empty animation
            }

            this.#animation._framesLeftToPlay = numberOfFrames;
            this.play();
            this.#preloader._maybePreloadAll();
        } else {
            this.#data.deferredAction = this.playFrames.bind(this, numberOfFrames);
            this.#preloader._startLoading();
        }
        return this;
    }
    /**
     * Change the direction of the animation. Alias to <b>setOption('reverse', true)</b>
     * @param {boolean} [reverse=true] - true for backward animation, false for forward, default "true"
     * @returns {AnimateImages} - plugin instance
     */
    setReverse(reverse = true){
        this.#settings.reverse = !!reverse;
        return this;
    }
    /**
     * Get current reverse option. Alias to <b>getOption('reverse')</b>
     * @returns {boolean} - reverse or not
     */
    getReverse() { return this.#settings.reverse; }
    /**
     * Change the direction of the animation. It does the opposite effect of <b>setReverse()</b>
     * @param {boolean} [forward=true] - true for forward animation, false for backward, default "true"
     * @returns {AnimateImages} - plugin instance
     */
    setForward(forward = true){
        this.#settings.reverse = !forward;
        return this;
    }
    /**
     * Start preload specified number of images, can be called multiple times.
     * If all the images are already loaded, then nothing will happen
     * @param {number} number - Number of images to load. If not specified, all remaining images will be loaded.
     * @returns {AnimateImages} - plugin instance
     */
    preloadImages(number= undefined){
        number = number ?? this.#settings.images.length;
        this.#preloader._startLoading(number);
        return this;
    }
    /**
     * Calculate new canvas dimensions. Should be called after the canvas size was changed manually
     * Called automatically after page resize
     * @returns {AnimateImages} - plugin instance
     */
    updateCanvas(){
        this.#updateCanvasSizes();
        return this;
    }
    /**
     * Returns option value
     * @param {string} option - Option name. All options are allowed
     * @returns {*} - Current option value
     */
    getOption(option){
        if ( option in this.#settings ) {
            return this.#settings[option];
        } else {
            console.warn(`${option} is not a valid option`);
        }
    }
    /**
     * Set new option value
     * @param {string} option - Option name. Allowed options: fps, loop, reverse, inversion, ratio, fillMode, draggable, dragModifier,
     * touchScrollMode, pageScrollTimerDelay, onPreloadFinished, onPosterLoaded, onAnimationEnd, onBeforeFrame, onAfterFrame
     * @param {*} value - New value
     * @returns {AnimateImages} - plugin instance
     */
    setOption(option, value) {
        const allowedOptions = ['fps', 'loop', 'reverse', 'inversion', 'ratio', 'fillMode', 'draggable', 'dragModifier', 'touchScrollMode',
            'pageScrollTimerDelay', 'onPreloadFinished', 'onFastPreloadFinished', 'onPosterLoaded', 'onAnimationEnd', 'onBeforeFrame', 'onAfterFrame'];
        if (allowedOptions.includes(option)) {
           this.#settings[option] = value;
           if (option === 'fps') this.#animation._updateDuration();
           if (option === 'ratio') this.#updateCanvasSizes();
           if (option === 'fillMode') this.#updateCanvasSizes();
           if (option === 'draggable') this.#toggleDrag(value);
           if (option === 'dragModifier') this.#settings.dragModifier = Math.abs(+value);
        } else {
            console.warn(`${option} is not allowed in setOption`);
        }
        return this;
    }
    /** @returns {number} - current frame number */
    getCurrentFrame() { return this.#data.currentFrame }
    /** @returns {number} - total frames (considering loading errors) */
    getTotalImages() { return this.#data.totalImages }
    /** @returns {number} - current canvas ratio */
    getRatio() { return this.#data.canvas.ratio }
    /** @returns {boolean} - animating or not */
    isAnimating() { return this.#animation._isAnimating }
    /** @returns {boolean} - returns true if a drag action is in progress */
    isDragging() {
        if ( this.#dragInput ) return this.#dragInput._isSwiping;
        return false
    }
    /** @returns {boolean} - is preload finished */
    isPreloadFinished() { return this.#preloader._isPreloadFinished }
    /** @returns {boolean} - is fast preview mode preload finished */
    isFastPreloadFinished() { return this.#preloader._isFastPreloadFinished }
    /** @returns {boolean} - is loaded with errors */
    isLoadedWithErrors() { return this.#preloader._isLoadedWithErrors }

    /**
     * Stop the animation and return to the first frame
     * @returns {AnimateImages} - plugin instance
     */
    reset(){
        if ( this.#preloader._isAnyPreloadFinished ) {
            this.stop();
            this.#changeFrame(normalizeFrameNumber(1, this.#data.totalImages));
            this.#preloader._maybePreloadAll();
        } else {
            this.#data.deferredAction = this.reset.bind(this);
            this.#preloader._startLoading();
        }
        return this;
    }
    /**
     * Stop animation, remove event listeners and clear the canvas. Method doesn't remove canvas element from the DOM
     */
    destroy(){
        this.stop();
        this.#render._clearCanvas();
        this.#toggleDrag(false);
        this.#toggleResizeHandler(false);
    }
}
/**
 * NOTE
 * All internal classes have public methods and properties start with _, that's for terser plugin that can mangle internal names
 * by regexp. It's reducing size by about 20%. Private (#) properties are not used in internal classes because babel use wrapper
 * functions for these properties, which increases the size even though private names are minified
 */

/**
 * @typedef {Object} PluginOptions
 * @property {Array<string>} images - Array with images URLs (required)
 * @property {'all'|'partial'|'none'} [preload="all"] - Preload mode ("all", "none", "partial")
 * @property {number} [preloadNumber=0] - Number of preloaded images when <b>preload: "partial"</b>, 0 for all
 * @property {string} [poster] - Url of a poster image, to show before load
 * @property {number} [fps=30] - FPS when playing. Determines the duration of the animation (for example 90 images and 60
 * fps = 1.5s, 90 images and 30fps = 3s)
 * @property {boolean} [loop=false] - Loop the animation
 * @property {boolean} [autoplay=false] - Autoplay
 * @property {boolean} [reverse=false] - Reverse direction
 * reverse means forward or backward, and inversion determines which direction is forward. Affects animation and drag
 * @property {number} [ratio] - Canvas width/height ratio, it has higher priority than inline canvas width and height
 * @property {'cover'|'contain'} [fillMode="cover"] - Fill mode to use if canvas and image aspect ratios are different
 * ("cover" or "contain")
 * @property {boolean} [draggable=false] - Draggable by mouse or touch
 * @property {boolean} [inversion=false] - Inversion changes drag direction
 * @property {number} [dragModifier=1] - Sensitivity factor for user interaction. Only positive numbers are allowed
 * @property {'pageScrollTimer' | 'preventPageScroll' | 'allowPageScroll'} [touchScrollMode = "pageScrollTimer"] - Page
 * scroll behavior with touch events (preventPageScroll,allowPageScroll, pageScrollTimer)
 * @property {number} [pageScrollTimerDelay=1500] - Time in ms when touch scroll will be disabled during interaction
 * if <b>touchScrollMode: "pageScrollTimer"<b>
 * @property {'width'|'height'} [responsiveAspect="width"] - Which side will be responsive (controlled by css)
 * @property {Object|false} [fastPreview=false] - Special mode for interactivity after loading only a part of the pictures
 * @property {Array<string>} [fastPreview.images] - images urls for fastPreview mode (<b>Required</b> if fastPreview is enabled)
 * @property {number} [fastPreview.fpsAfter] - fps value that will be applied after the full list of images is loaded
 * @property {function(number):number} [fastPreview.matchFrame] - A function that takes the frame number of the short set
 * and returns the frame number of the full set, to prevent jump after full load.
 * @property {function(AnimateImages):void} [onPreloadFinished] - Occurs when all image files have been loaded
 * @property {function(AnimateImages):void} [onFastPreloadFinished] - Occurs when all fastPreview mode images have been loaded
 * @property {function(AnimateImages):void} [onPosterLoaded] - Occurs when poster image is fully loaded
 * @property {function(AnimateImages):void} [onAnimationEnd] - Occurs when animation has ended
 * @property {function(AnimateImages, FrameInfo):void} [onBeforeFrame] - Occurs before new frame
 * @property {function(AnimateImages, FrameInfo):void} [onAfterFrame] - Occurs after the frame was drawn
 */

/**
 * @typedef {Object} FrameInfo
 * @property {CanvasRenderingContext2D} context - canvas context
 * @property {number} width - internal canvas width
 * @property {number} height - internal canvas height
 * */

export { AnimateImages as default };
//# sourceMappingURL=animate-images.esm.js.map
