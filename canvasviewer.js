(function () {
  WPViewer = function () {
    /*
    Main App class
    starts the loading of the assets
    instanciates and prepare the main components
    */
    
    function App() {

      var debug = true;
      this.startFile;
      this.simpleViewer;
      this.viewers = [];
      this.activeViewer;

      this.init = function(){
        ContextManager().init(onContextReady);
      }    

      this.getDomPath = function(el) {
        var stack = [];
        while ( el.parentNode != null ) {
            var sibCount = 0;
            var sibIndex = 0;
            for ( var i = 0; i < el.parentNode.childNodes.length; i++ ) {
                var sib = el.parentNode.childNodes[i];
                if ( sib.nodeName == el.nodeName ) {
                    if ( sib === el ) {
                        sibIndex = sibCount;
                    }
                    sibCount++;
                }
            }
            if ( el.hasAttribute('id') && el.id != '' ) {
                stack.unshift(el.nodeName.toLowerCase() + el.id);
            } else if ( sibCount > 1 ) {
                stack.unshift(el.nodeName.toLowerCase() + sibIndex);
            } else {
                stack.unshift(el.nodeName.toLowerCase());
            }
            el = el.parentNode;
        }
        return stack.slice(1); // removes the html element
      }  

      //when all the common objects are ready and the assets are available
      function continueInit() {
        this.locale = new WLLocale();
        this.locale.init();
        this.simpleViewer = new SimpleViewer();
        this.simpleViewer.init();
      }

      function onContextReady() {
        continueInit();
      }

      //debug conditionnal logging
      this.trace = function (_msg) {
        if (debug) {
          console.log("WPAPP - " + _msg);
        }
      }

    }

    //handles the publication context data like content and template
    function ContextManager() {

      if (arguments.callee._singletonInstance) {
        return arguments.callee._singletonInstance;
      }
      arguments.callee._singletonInstance = this;

      this.contentManager;
      this.templateManager;
      var startUrl = "publication/contents/pubinfo.xml";
      var startFile;
      var contentUrl;
      var templateUrl;
      var contentsXml;
      var templateXml;
      var onContextReady;
      this.globalVars = {};
      this.ready = false;

      this.init = function (_onContextReady) {
        WLUtils.load(startUrl, onStartFileLoaded, this);
        onContextReady = _onContextReady;
      }

      function continueInit() {        
        resolveAllVars(this);
        this.templateManager = new TemplateManager();
        this.contentManager = new ContentManager();
        this.contentManager.init(contentsXml, this.globalVars);
        this.templateManager.init(templateXml,onAssetManagerReady);        
      }

      function checkAllReady() {
        if (contentsXml && templateXml) {
          continueInit();
        }
      }

      function setRootPath() {
        var rootPath = startUrl.substring(0,startUrl.lastIndexOf("/")+1);
        rootVarValue = globalVars.root;
        if(rootVarValue == ".."){
          rootPath = rootPath.substring(0,rootPath.substring(0,rootPath.length-2).lastIndexOf("/")+1);
        }
        globalVars.root = rootPath;
      }

      function onStartFileLoaded(_startFile) {
        startFile = new window.DOMParser().parseFromString(_startFile, "text/xml").firstChild;
        readVars(startFile.querySelector("variables"), this);
        setRootPath();
        contentUrl = startFile.querySelector("contents").getAttribute("url");
        WLUtils.load(this.resolveGlobalVars(contentUrl), onContentsLoaded, this);
        templateUrl = startFile.querySelector("template").getAttribute("url");
        WLUtils.load(this.resolveGlobalVars(templateUrl), onTemplateLoaded, this);
      }

      function onContentsLoaded(_contentsFile) {
        contentsXml = new window.DOMParser().parseFromString(_contentsFile, "text/xml").firstChild;
        readVars(contentsXml.querySelector("variables"), this);
        checkAllReady();
      }

      function onTemplateLoaded(_templateFile) {
        templateXml = new window.DOMParser().parseFromString(_templateFile, "text/xml").firstChild;
        readVars(templateXml.querySelector("variables"), this);
        checkAllReady();
      }

      function onAssetManagerReady() {
        this.ready = true;
        onContextReady();
      }

      function resolveAllVars(_context) {
        for (var i in _context.globalVars) {
          _context.globalVars[i] = WLUtils.resolveVars(_context.globalVars[i], _context.globalVars, "$");
        }
      }
      //adds all the children tags of _xml with the form <name value="value"> into the object _context.globalVars
      function readVars(_xml, _context) {
        for (var i = 0; i < _xml.childNodes.length; i++) {
          var node = _xml.childNodes[i];
          if (node.nodeType != 1) {
            continue;
          }

          _context.globalVars[node.nodeName] = WLUtils.resolveVars(node.getAttribute("value"), _context.globalVars,"$");
        }
      }
      this.resolveGlobalVars = function (_txt) {
        return WLUtils.resolveVars(_txt, this.globalVars, "$")
      }
      return this;
    }


    function GenericPreloader(_contentId){

      //protected var model:ViewerModel;//model class for the flipBook
      var contentId = _contentId;
      var preloader = this;

      var backQueueLength = 2;//length of the preloading backward
      var frontQueueLength = 2;//length of the preloading forward
      var backFlushLength = 3;//length of the flushing backward
      var frontFlushLength = 3;//length of the flushing forward

      var loadingPages = [];
      var preloadJob;//List of pages to preload (after isFull is called)
      var nbLoading = 0;//number of pages still to load
      var flushFileJob;//job describing all the flush to make in the Bitmap vector

      var pageChangeTimeout;
      var observers = [];//observers for pageLoading

      this.labelFunction = 'onPageLoaded'; 

      var extension = ContextManager().contentManager.getProperty(contentId, "extensions");
      var nbPages = ContextManager().contentManager.pagesNum;
      //model.addEventListener(ViewerModel.PAGE_CHANGE, onPageChange);  
      var itemsList = [];//list containing all the page files
      var items = itemsList;
      

      this.onPageChange = function () {
        clearTimeout(pageChangeTimeout);
        pageChangeTimeout = setTimeout(checkQueue, 60,this);
      }
      
      this.getPage = function (_pageIndex, _refObs) {
        if (_pageIndex < 0 || _pageIndex > nbPages) {
          return null;
        }
        if (itemsList[_pageIndex] == null) {
          //checkQueue();
          isFull();
          //if i need the last image, but it's not in the queue, i need to mannualy add it
          if (preloadJob.indexOf(_pageIndex) == -1) {
            preloadJob.push(_pageIndex);
          }
          processFileQueue();
          if (itemsList[_pageIndex])
            return itemsList[_pageIndex];
          
          addPageObserver(_refObs, _pageIndex);
          return null;
        }

        return itemsList[_pageIndex];
      }
      
        /**
         * Triggers the queue mechanism if needed
         * is called whenever the queue should be checked (page change for example)
         */
      function checkQueue(preloader) {
        if (!isFull())
          processFileQueue();
      }

        /**
         * Verifies if the cache is full and returns the answer
         * Also fills 2 Arrays containing all the pages needed to be preloaded or draw into a bitmap
         * @return
         */
      function isFull() {
        
        preloadJob = [];
        flushFileJob = [];
        var currentPage = wpApp.activeViewer.currentPage;

        var firstPageFile = currentPage - backQueueLength > 0 ? currentPage - backQueueLength : 0;
        var lastPageFile = currentPage + frontQueueLength <= nbPages-1 ? currentPage + frontQueueLength : nbPages-1;


        var firstPageFileFlush = currentPage - backFlushLength > 0 ? currentPage - backFlushLength : 0;
        var lastPageFileFlush = currentPage + frontFlushLength <= nbPages-1 ? currentPage + frontFlushLength : nbPages-1;

        for (var i = 0; i <= nbPages; ++i) {

          if (i >= firstPageFile && i <= lastPageFile) {
            if (itemsList[i] == null) {
              preloadJob.push(i);
            }
          }
          if (itemsList[i] != null && (i < firstPageFileFlush || i > lastPageFileFlush)) {
            flushFileJob.push(i);
          }
        }

        return !(preloadJob.length > 0 || flushFileJob.length > 0);
      }

      /**
       * after Queue has been declared not up to date, this function triggers the loading of the elements missing, listed in :
       * preloadJob:Array
       * and
       * bitmapJob:Array
       */
      this.createImageLoader = function(_url, _handler,_errorHandler,_pageNum,_scope) {
        var imgLoader = new Image();
        
        if(_scope == null){
          _scope = preloader;
        }
        imgLoader.onload = function(){  
          _handler.apply(_scope,[this,_pageNum]);
        }
        imgLoader.onerror = function(){
          _errorHandler.apply(_scope,[this,_pageNum]);
        }
        imgLoader.src = _url;
      }

      function createTextLoader(_url, _handler,_errorHandler,_pageNum,_scope) {
        if(_scope == null){
          _scope = preloader;
        }
        var handler = function(_content){
          _handler.apply(_scope,[_content,_pageNum]);
        }
        WLUtils.load(_url, handler, this);
      }

      /**
       * launch preload on missing pages
       */
      function processFileQueue() {
        for (var i = 0; i < preloadJob.length; ++i) {
          var pageNum = preloadJob[i];
          if (loadingPages[pageNum] == null) {
            loadingPages[pageNum] = true;
            var completePath = ContextManager().contentManager.getFilePath(contentId,pageNum);
            /*if (_allowCacheBuster)
            completePath += "?CacheBusterID=" + new Date().getTime();*/
            if(extension == "jpg"){
              preloader.createImageLoader(completePath, onComplete,errorHandler,pageNum,this);
            }else if(extension == "xml"){
              createTextLoader(completePath, onComplete,errorHandler,pageNum,this);
            }
            nbLoading++;
          }
        }        
        emptyQueue();
      }

      /**
       * Determines which file just arrived
       * Stores reference in the pageFile Vector
       * @param loader_
       * CustomLoader event
       */
      function onComplete(_image,_pageNum) {
        itemsList[_pageNum] = _image;
        loadingPages[_pageNum] = null;
        dispatchPageEvent(_pageNum);
        nbLoading--;
      }

      function errorHandler(_image,_pageNum) {
        loadingPages[_pageNum] = null;
        if (observers[_pageNum] != null) {
          var tmpObs = observers[_pageNum];

          while (tmpObs.length > 0) {
            var obj = tmpObs[0];
            obj['onItemMissing'](items[_pageNum], _pageNum);
            removePageObserver(obj, _pageNum);
          }
        }
      }
         
      function emptyQueue() {
        for (var i = 0; i < flushFileJob.length; ++i) {
          var pageNum = flushFileJob[i];
          itemsList[pageNum] = null;
        }
      }
         
      this.invalidate = function(_pageNum) {
        itemsList[_pageNum] = null;
        loadingPages[_pageNum] = null;
      }
      
      this.clean = function() {
        var nbPages = ContextManager().contentManager.pagesNum;
        flushFileJob = [];        
        for (var i = 0; i <= nbPages; ++i) {
          flushFileJob.push(i);
        }        
        emptyQueue();
      }
      
      /**
       * Store the * instance reference for later call back
       * @param    _refObs
       * * instance reference
       * @param    _pageIndex
       * number of the page
       */
      function addPageObserver(_refObs, _pageIndex) {
        removeObserver(_refObs);

        
        
        if (observers[_pageIndex] == undefined){
          observers[_pageIndex] = [];
        }
        if (observers[_pageIndex].indexOf(_refObs) != -1) {
          return;
        }
        observers[_pageIndex].push(_refObs);
      }
         
      /**
       * remove observer for any pageNumber from the list
       * @param    _refObs
       */
      function removeObserver(_refObs){
        var index;

        for (var obsListId in observers) {
          var obsList = observers[obsListId];
          index = obsList.indexOf(_refObs);

          if (index != -1)
            obsList.splice(index, 1);
        }
      }
         
      /**
       * remove observer/pageNumber couple from the list
       * @param    _refObs
       */

      function removePageObserver(_refObs, _pageNum) {
        var pageObserverList = observers[_pageNum];
        index = pageObserverList.indexOf(_refObs);
        if (index != -1){
          pageObserverList.splice(index, 1);
        }
      }
         
      /**
       * dispatch page ready event to the * Observers
       *
       * @param    index_
       * number of the page just ready
       */
      function dispatchPageEvent(_index) {        
        if (items[_index] != null && observers[_index] != null) {
          var tmpObs = observers[_index];
          while (tmpObs.length > 0) {
            var obj = tmpObs[0];
            /*if(obj[preloader.labelFunction] == null){
              console.log("error");
            }*/
            obj[preloader.labelFunction](items[_index], _index);
            removePageObserver(obj, _index);
          }
        }
      }
      
      function hasObserver(_index) {
        return items[_index] != null && observers[_index] != null;
      }
      
      this.destroy = function() {
        clearTimeout(pageChangeTimeout);
        if (loadingPages)
          loadingPages.length = 0;
        if (preloadJob)
          preloadJob.length = 0;
        if (flushFileJob)
          flushFileJob.length = 0;
        if (itemsList)
          itemsList.length = 0;
        observers.length = 0;
        observers = null;
        items = null;
      }

    }

    function SimpleViewer() {
      SimpleViewer.prototype.id = "simpleViewer";
      SimpleViewer.prototype.currentPage = 0;
      var viewer = this;

      var mainContainer;
      var listeningTransitionEnd;
      var linkContainer;
      var initialMouseX;
      var mouseMoved;
      var dragging;
      var imgTransition = "";
      var nextImgPlaced;
      var imgPlaced;
      var lastTimestamp;
      var initialMouseY;
      var offsetX = 0;
      var offsetY = 0;
      var context;
      var img;            
      var marginRight = 10;
      var marginBottom = 10;
      var marginLeft = 10;
      var marginTop = 10;
      var screenWidth;
      var screenHeight;
      var transitionning = false;
      var direction;
      var nbPages = ContextManager().contentManager.pagesNum;
      var nextImg;
      var offsetTarget;
      var transitionTime = 200;
      var startTransitionTime;
      var transitionInterval;
      var zoomLoadingTimeout;
      var links;
      var linksDef = [];
      var basePageWidth = parseFloat(ContextManager().contentManager.getProperty("swf", "width"));
      var basePageHeight = parseFloat(ContextManager().contentManager.getProperty("swf", "height"));
      var lastWidth;
      var lastHeight;
      var pagePosition;
      var preloader;
      var linkPreloader;
      var minDragFrameDuration = 85;
      var transitionDuration = 0.13;
      var tmpDefaultPage = document.createElement("img");
      var defaultImageData = "data:image/gif;base64,R0lGODlhAQABAPAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
      tmpDefaultPage.setAttribute("src",defaultImageData);
      

      function getDefaultPage (){
        //return null;
        console.log("getDefaultPage")
        var newDefaultPage = tmpDefaultPage.cloneNode();
        newDefaultPage.width = basePageWidth;
        newDefaultPage.height = basePageHeight; 
        newDefaultPage.setAttribute("data-default","true");
        return newDefaultPage;
      } 

      SimpleViewer.prototype.init = function () {

        mainContainer = document.createElement("div");
        mainContainer = document.body.appendChild(mainContainer);
        //removes 
        mainContainer.onselectstart = function(e){e.preventDefault();return false;}
        mainContainer.onmousedown = function(event){
          onMouseDown(event);
        }
        mainContainer.addEventListener("touchstart",function(event){
          onMouseDown(event);
        });
        mainContainer.setAttribute("class","simpleViewer");

        linkContainer = document.createElement("div");        
        
        linkContainer.setAttribute("class","absolute");
        mainContainer.appendChild(linkContainer);
        
        wpApp.viewers.push[this];
        wpApp.activeViewer = this;

        preloader = new GenericPreloader("Low");
        linkPreloader = new GenericPreloader("links");
        linkPreloader.labelFunction = "onLinkLoaded";

        screenWidth = window.innerWidth;
        screenHeight = window.innerHeight;

        getPagePosition();

        var tmpPage = preloader.getPage(0,viewer);
        if(tmpPage == null){
          tmpPage = getDefaultPage();
        }
        if(tmpPage != null){
          this.onPageLoaded(tmpPage,0);
        }
        window.onresize = function(){
          viewer.onResize();
        }
        
      }

      function getScreenRect(){
        return {x:marginLeft,y:marginTop,width:screenWidth - marginLeft - marginRight,height:screenHeight - marginTop - marginBottom}
      }

      SimpleViewer.prototype.onResize = function(){
        screenWidth = window.innerWidth;
        screenHeight = window.innerHeight;
        getPagePosition();
        drawPage();
        placeLinkContainer();
      }

      SimpleViewer.prototype.onPageLoaded = function(_image,_pageNum){
        if(transitionning){
          return;
        }
        
        console.log("onPageLoaded begin");
        var imgs = document.querySelectorAll("img");
        if(imgs.length > 1){
          console.log("problem onPageLoaded");
        }
        removeImg();
        img = _image;
        imgPlaced = false;
        if(pagePosition == null){
          getPagePosition();
        }
        
        drawPage();
        linkPreloader.getPage(viewer.currentPage,viewer);
        clearTimeout(zoomLoadingTimeout);
        zoomLoadingTimeout = setTimeout(onEndTransition,500,viewer);

        console.log("onPageLoaded end");
      }

      SimpleViewer.prototype.onLinkLoaded = function(_links,_pageNum){
        if(_pageNum != this.currentPage){
          return;
        }
        links = _links;
        drawLinks();
      }

      function getPagePosition(){
        if(img == null && lastWidth == null){
          return;
        }
        lastWidth = img != null ? img.width  : lastWidth;
        lastHeight = img != null ? img.height  : lastHeight;
        var newRect = WLUtils.getRestrictRect({x:0,y:0,width:lastWidth,height:lastHeight},getScreenRect());
        newRect.marginXNext = screenWidth - newRect.x;
        newRect.scale = newRect.width/basePageWidth;
        pagePosition = newRect;
      }

      function drawLinks(){
        links = new window.DOMParser().parseFromString(links, "text/xml");
        links = links.querySelectorAll("lk");
        placeLinkContainer();
        for(var i = 0;i<links.length;i++){
          var link = links[i];
          var content = link.querySelector("content");
          var def = {};
          def.x = parseFloat(content.getAttribute("x"));
          def.y = parseFloat(content.getAttribute("y"));
          def.width = parseFloat(content.getAttribute("width"));
          def.height = parseFloat(content.getAttribute("height"));
          def.contentFile = content.querySelector("file");
          if(def.contentFile){
            def.contentFile = ContextManager().resolveGlobalVars(def.contentFile.getAttribute("url"));
          }else{
            continue;
          }
          var handler = function(_content){
            onAnimLinkLoaded.apply(viewer,[_content,link,def]);
          }
          WLUtils.load(def.contentFile, handler, this);
        }
      }

      function loadLinks(){
        deleteLinks();
        var linksTmp = linkPreloader.getPage(viewer.currentPage,viewer);
        if(linksTmp != null){
          viewer.onLinkLoaded(linksTmp,viewer.currentPage);
        }
      }

      function deleteLinks(){        
        for(var i = 0;i<linksDef.length;i++){
          var linkDef = linksDef[i];
          linkContainer.removeChild(linkDef.element);
          linkDef.animClass.destroy();
        }
        linksDef.length = 0;
      }

      function placeLinkContainer(){
        linkContainer.setAttribute("style",imgTransition+"transform: translate("+(pagePosition.x+offsetX)+"px, "+(pagePosition.y+offsetY)+"px) scale3d("+pagePosition.scale+","+pagePosition.scale+","+pagePosition.scale+")");
      }

      function onAnimLinkLoaded(_animHTML,_link,_linkDef){
        anim = new window.DOMParser().parseFromString(_animHTML, "text/html");
        style = anim.body.querySelector("style");
        bodyChildren = anim.querySelectorAll("body > div");
        script = anim.querySelector("script");
        var animElement = document.createElement("div");
        animElement.setAttribute("id","wpanim");
        animElement = linkContainer.appendChild(animElement);
        animElement.setAttribute("style","position: absolute;transform: translate("+_linkDef.x+"px, "+_linkDef.y+"px)");
        _linkDef.element = animElement;
        linksDef.push(_linkDef);
        animElement.appendChild(style);
        for(var i=0;i<bodyChildren.length;i++){
          var bodyChild = bodyChildren[i];
          var img = bodyChild.querySelector("img");
          var url = img.getAttribute("src").replace("assets/",_linkDef.contentFile+"assets/");
          img.setAttribute("src",url);
          animElement.appendChild(bodyChild);
        }
        url = script.getAttribute("src").replace("assets/",_linkDef.contentFile+"assets/");
        var newScript = document.createElement( 'script' );
        newScript.type = 'text/javascript';        
        newScript.src = url;
        newScript = animElement.appendChild(newScript);
        newScript.onload = function(event){
          onAnimScriptLoaded(event,newScript,_linkDef);
        };
        
      }

      function onAnimScriptLoaded(event,_newScript,_linkDef){
        _linkDef.animClass = WPAnimsClasses[wpApp.getDomPath(_newScript).join("")];
      }

      function placePages(){
        if(img == null){return;}
        
        var scale = pagePosition.width / img.width;
        var transition = imgPlaced?imgTransition:"transition:none;";
        if(nextImg && transitionning){
          var imgX = direction == -1?pagePosition.x+offsetX:pagePosition.x+offsetX;
          img.setAttribute("style",transition+"transform:translate("+imgX+"px,"+pagePosition.y+"px) scale("+scale+","+scale+")");
          imgPlaced = true;
          
          //var imageWidth = nextImg.width != null : nextImg.width : 10;
          //log("taille "+nextImg.width);
          scale = pagePosition.width / nextImg.width;
          imgX = direction == 1?pagePosition.marginXNext+pagePosition.x+offsetX:pagePosition.x+offsetX-pagePosition.marginXNext;
          transition = nextImgPlaced?imgTransition:"transition:none;";
          nextImg.setAttribute("style",transition+"transform:translate("+imgX+"px,"+pagePosition.y+"px) scale("+scale+","+scale+")");
          nextImgPlaced = true;          
        }else{
          //log(imgPlaced);
          //log(imgTransition);
          //log(transition);
          img.setAttribute("style",transition+"transform:translate("+pagePosition.x+"px,"+pagePosition.y+"px) scale("+scale+","+scale+")");
          imgPlaced = true;
          if(listeningTransitionEnd){
            endTransition();
          }
        }
        
      }

      function removeNextImg(){
        console.log("removeNextImg");
        if(nextImg && nextImg.parentElement){
          nextImg.parentElement.removeChild(nextImg);
        }
      }

      function removeImg(){
        console.log("removeImg");
        if(img && img.parentElement){
          img.parentElement.removeChild(img);
        }
      }

      function addImg(){
        
        if(img != null && img.parentElement != mainContainer){
          console.log("addImg");
          img.setAttribute("class","absolute notInteractive");
          img = mainContainer.insertBefore(img,linkContainer);
        }
        var imgs = document.querySelectorAll("img");
        if(imgs.length > 1){
          console.log("problem");
        }
      }

      function addNextImg(){
        if(nextImg != null && nextImg.parentElement != mainContainer){
          console.log("addNextImg");
          nextImg = mainContainer.insertBefore(nextImg,linkContainer);
          nextImg.setAttribute("class","absolute notInteractive");
        }
        var imgs = document.querySelectorAll("img");
        if(imgs.length > 2){
          console.log("problem");
        }
      }

      function drawPage(){
        addImg();
        addNextImg();
        placePages();
      }

      function isValidPage(_pageNum){
        return _pageNum>=0 && _pageNum<nbPages;
      }

      function getNextPage(){
        var tmp = viewer.currentPage;
        if(++tmp >= nbPages-1){
          tmp = nbPages-1;
        }
        return tmp;
      }

      function getPrevPage(){
        var tmp = viewer.currentPage;
        if(--tmp < 0){
          tmp = 0;
        }
        return tmp;
      }

      function onMouseDown(event){

        if(event.touches){
          event = event.touches[0];
        }
        if(transitionning){
          return;
        }
        //log("");
        //log("onMouseDown");
        initialMouseX = event.clientX;
        initialMouseY = event.clientY;
        offsetX = 0;
        offsetY = 0;

        mainContainer.addEventListener("touchmove",onMouseMove);
        mainContainer.onmousemove = function(event){
          onMouseMove(event);
        }
        mainContainer.addEventListener("touchend",onMouseUp);
        mainContainer.onmouseup = function(event){
          onMouseUp(event);
        }
        dragging = true;
        window.requestAnimationFrame(dragFrameAnim);
        
      }

      function onMouseUp(event){
        //log("onMouseUp");
        mainContainer.onmousemove = null;
        mainContainer.removeEventListener("touchmove",onMouseMove);
        mainContainer.onmouseup = null;
        mainContainer.removeEventListener("touchend",onMouseUp);
        dragging = false;
        imgTransition = "transition:none;";
        if(transitionning){
          stopTransition();
        }
      }

      function onMouseMove(event){
        if(event.touches){
          event = event.touches[0];
        }
        offsetX = event.clientX - initialMouseX;
        mouseMoved = true;
      }

      function dragFrameAnim(_timestamp){
        if(mouseMoved && (lastTimestamp == null || _timestamp - lastTimestamp >= minDragFrameDuration)){
          if(!transitionning){
            if(offsetX<0){
              startDrag(1);
            }else if(offsetX>0){
              startDrag(-1);
            }
          }
          imgTransition = "transition: transform "+transitionDuration+"s linear;";
          lastTimestamp = _timestamp;
          placeLinkContainer();
          //log("dragFrameAnim");
          placePages();
          mouseMoved = false;
        }
        if(dragging){
          window.requestAnimationFrame(dragFrameAnim);
        }
      }

      function startDrag(_direction){

        if(!isValidPage(viewer.currentPage+_direction)){
          offsetX = 0;
          mainContainer.onmousemove = null;
          //log("startDrag");
          placePages();
          return;
        }
        var imgs = document.querySelectorAll("img");
        if(imgs.length > 1){
          console.log("problem");
        }
        console.log("startDrag");
        if(zoomLoadingTimeout){
          clearTimeout(zoomLoadingTimeout);
          zoomLoadingTimeout = null;
        }
        imgPlaced = false;
        direction = _direction;
        transitionning = true;
        var tmpNextImg = preloader.getPage(direction == 1?getNextPage():getPrevPage(),viewer);
        nextImgPlaced = false;
        if(tmpNextImg == null){
          tmpNextImg = getDefaultPage();
        }
        removeNextImg();
        nextImg = tmpNextImg;
        drawPage();
      }

      function stopTransition(){
        //log("stopTransition");
        lastTimestamp = null;
        offsetTarget = (-screenWidth + pagePosition.x)*direction;
        startXOffset = offsetX;
        offsetX = offsetTarget;
        imgTransition = "transition: transform "+0.25+"s ease-in;";
        mouseMoved = false;
        if(img != null){
          imgPlaced = true;
          img.addEventListener("transitionend",onPageTransitionEnd,false);
          listeningTransitionEnd = true;
          placePages();
          placeLinkContainer();
        }else{
          endTransition();
        }
      }

      function onPageTransitionEnd(event){
        console.log("onPageTransitionEnd");
        img.removeEventListener("transitionend",onPageTransitionEnd);
        endTransition();
      }

      function endTransition(){
        //log("endTransition");
        listeningTransitionEnd = false;
        removeImg();
        if(direction == 1){
          viewer.currentPage = getNextPage();
        }else{
          viewer.currentPage = getPrevPage();
        }
        console.log(nextImg.getAttribute("data-default"));
        if(nextImg != null && nextImg.getAttribute("data-default") == "true"){
          
          var tmpImage = preloader.getPage(viewer.currentPage,viewer);
          if(tmpImage){
            removeNextImg();
            img = tmpImage;
          }
        }else{
          img = nextImg;
        }
        var imgs = document.querySelectorAll("img");
        if(imgs.length > 1){
          console.log("problem");
        }
        imgPlaced = false;
        nextImg = null;
        
        offsetX = 0;
        transitionning = false;
        startTransitionTime = null;
        preloader.onPageChange();
        linkPreloader.onPageChange();
        drawPage();
        zoomLoadingTimeout = setTimeout(onEndTransition,500,viewer);
        loadLinks();
      }

      function setTransitionFrame(_timestamp){
        if (!startTransitionTime) startTransitionTime = _timestamp;
        elapsed = _timestamp - startTransitionTime;
        var finished = elapsed>=transitionTime;
        if(finished){
          elapsed = transitionTime;
          endTransition();
        }else{
          offsetX = easeOutQuad(elapsed,startXOffset,offsetTarget - startXOffset,transitionTime);
          //log("setTransitionFrame");
          placePages();
        }
        
        placeLinkContainer();
        if(!finished){
          window.requestAnimationFrame(setTransitionFrame);
        }
      }

      function onEndTransition(viewer){
        var completePath = ContextManager().contentManager.getFilePath("Zoom",viewer.currentPage);
        preloader.createImageLoader(completePath, onZoomPageLoaded,onZoomPageError,viewer.currentPage,viewer);
      }

      function onZoomPageLoaded(_image,_pageNum){
        if(_pageNum == viewer.currentPage && !transitionning){
          removeImg();
          img = _image;
          imgPlaced = false;
          console.log("onZoomPageLoaded");
          drawPage();
        }
      }

      function onZoomPageError(_image,_pageNum){
        wpApp.trace("onZoomPageError")
      }
      
      function easeOutQuad(t, b, c, d) {
        return -c *(t/=d)*(t-2) + b;
      }
    }

    //handles the preloading of the template assets at the start of the application : locale, config, interface, css, ...
    //and provide their contents
    //if integrated in main source it should load template.xml
    function TemplateManager() {
      var xml;
      var assetsNode;
      var assets = {};
      var assetsPreloading = 0;
      var onAssetPreloaded;
      //filters out these assets, when switching for the class in the mail visio JS cources, you can reactivate the loading of the base assets
      var idFilterOut = ["main_lib","interface", "css", "css_flash", "css_html5", "description_css","font", "shop_lib"];
      var idFilterIn = ["interface","locale","config","locale_cart", "tpl", "tpl2"];

      this.init = function (_xml, _onAssetsPreloaded) {
        xml = _xml;
        onAssetPreloaded = _onAssetsPreloaded;
        assetsNode = xml.querySelector("assets");

        for (var i = 0; i < assetsNode.childNodes.length; i++) {

          var assetNode = assetsNode.childNodes[i];
          if (assetNode.nodeType != 1) {
            continue;
          }
          var assetId = assetNode.getAttribute("id");
          //filters in or out, in have priority, to use out, undeclare idFilterIn
          if ((idFilterIn && idFilterIn.indexOf(assetId) == -1) || (!idFilterIn && idFilterOut && idFilterOut.indexOf(assetId) != -1)) {
            continue;
          }
          var onStart = assetNode.getAttribute("onstart");
          if (onStart == undefined || onStart == "true") {
            loadAsset(assetNode.getAttribute("type"), assetId, assetNode.getAttribute("url"));
          }
        }
      }

      function loadAsset(_type, _id, _url) {
        assetsPreloading++;
        assets[_id] = new AssetLoader(_type, _id, ContextManager().resolveGlobalVars(_url), ContextManager().templateManager.onAssetLoaded);
      }
      this.onAssetLoaded = function (_asset, _content) {
        assetsPreloading--;
        if (assetsPreloading == 0) {
          if (onAssetPreloaded) {
            onAssetPreloaded();
          }
        }
      }
      this.getAsset = function (_id) {
        if (!assets[_id]) {
          console.log("Asset not declared : " + _id);
          return null;
        }
        return assets[_id].content;
      }
    }

    function AssetLoader(_type, _id, _url, _callBack) {
      var type = _type;
      var id = _id;
      var url = _url;
      var callBack = _callBack;
      this.content;
      AssetLoader.prototype.onLoaded = function (_content) {
        this.content = _content;
        callBack(this, this.content);
      }

      WLUtils.load(_url, this.onLoaded, this);
    }

    //ContextManager.contentManager
    //handles the content description to provide the urls
    function ContentManager() {
      /**
       *  xml taken from tag --> config.xml -> root -> contents
       */
      var xml;
      var padding_chars = "0000000000000000";
      var NUM_VAR_NAME = "num";
      var NUM_VAR_DELIMITER = "%";
      var NUM_VAR = NUM_VAR_DELIMITER + NUM_VAR_NAME + NUM_VAR_DELIMITER;
      /**
       * Contains paths for all content-types
       * incl. prefixes
       */
      this.paths = {};
      this.prefixes = {};
      this.suffixes = {};
      this.paddings = {};
      this.extensions = {};
      this.fileNames = {};
      this.width = {};
      this.height = {};
      /**
       * Contains suffixes for all content-types
       */
      var suffix = '';
      var prefix = '';
      /**
       * Contains paddings for all content-types
       */
      var padding = 0

      /**
       * [shift] se adauga la indexul paginii pentru a obtine un nume corect de pagina
       * URLHelpers.getFilePath(index, ..) -> index += shift
       */
      var shift = 0;

      this.pagesNum;

      this.init = function (_xml, _hash) {
        xml = _xml.querySelector("contents");

        prefix = xml.getAttribute('prefix') ? xml.getAttribute('prefix') : '';
        suffix = xml.getAttribute('sufix') ? xml.getAttribute('suffix') : '';
        padding = xml.getAttribute('padding') ? parseInt(xml.getAttribute('padding')) : 0;
        shift = xml.getAttribute('shift') ? parseInt(xml.getAttribute('shift')) : 0;
        this.pagesNum = xml.getAttribute('pages_nr') ? parseInt(xml.getAttribute('pages_nr')) : 0;

        var contentId;
        var content;
        for (var i = 0; i < xml.childNodes.length; i++) {
          content = xml.childNodes[i];
          if (content.nodeType != 1) {
            continue;
          }

          contentId = content.getAttribute("id");

          //create the global var hash

          this.paths[contentId] = WLUtils.resolveVars(content.getAttribute("path", _hash, "$"));
          this.extensions[contentId] = content.getAttribute('type') ? content.getAttribute('type') : '';
          this.prefixes[contentId] = content.getAttribute('prefix') ? content.getAttribute('prefix') : prefix;
          this.suffixes[contentId] = content.getAttribute('suffix') ? content.getAttribute('suffix') : suffix;
          this.paddings[contentId] = content.getAttribute('padding') ? parseInt(content.getAttribute('padding')) :padding;
          this.fileNames[contentId] = content.firstChild && content.firstChild.nodeValue ? content.firstChild.nodeValue.trim() : '';
          this.width[contentId] =  parseInt(content.getAttribute('width'));
          this.height[contentId] = parseInt(content.getAttribute('height'));
        }
      }

      this.getProperty = function(_contentId,_propName){
        var prop = this[_propName];
        var value = prop[_contentId]
        return this[_propName][_contentId];
      }

      /**
       * Filename example: page0001big.swf
       * prefix - page
       * padding - 000 = 3 -> nr minim de caractere
       * index - 1, this value comes as parameter
       * sufix - big
       *
       * ext - swf, png, jpg, jpeg, etc.
       *
       *
       * Usage example
       * trace(URLHelpers.getFilePath('1', 'swf')) // contents/pages/page1.swf

       * @param index_ file index in queue wich is same as
       * @param contentId_ content tag id, example swf for flipBook and thumbnail for ThumbnailLoader
       *
       * @return complete path to the file, web or local path
       */
      this.getFilePath = function (content_id_, index_) {
        var path;
        if (index_ == null) {
          return ContextManager().resolveGlobalVars(this.paths[content_id_] + this.fileNames[content_id_] + '.' + this.extensions[content_id_]);
        }

        var delta = this.paddings[content_id_] - index_.toString().length;
        if (delta) {
          delta = 0;
        }
        // end to do

        // content/page
        // we check for the %num%
        var varHash = {};
        varHash[NUM_VAR_NAME] = (index_ + 1).toString();
        if (this.paths[content_id_].indexOf(NUM_VAR) != -1) {
          path = (this.paths[content_id_] + this.prefixes[content_id_] + padding_chars.substr(0, delta) + this.suffixes[
            content_id_] + '.' + this.extensions[content_id_]);
          path = WLUtils.resolveVars(path, varHash, NUM_VAR_DELIMITER);
        } else {
          path = (this.paths[content_id_] + this.prefixes[content_id_] + padding_chars.substr(0, delta) + (index_ + 1).toString() +
            this.suffixes[content_id_] + '.' + this.extensions[content_id_]);
        }

        return ContextManager().resolveGlobalVars(path);
      }

    }

    //just a container for some useful functions
    function WLUtils() {}
    //replaces any instance of a variable found in the "_src" string, take their value in the _hash object,
    //variable instances must start and end with the character defined in _separateChr
    WLUtils.resolveVars = function (_src, _hash, _separateChr) {
      var origsrc = _src;
      var currentIndex = 0;
      while (true) {
        var startIndex = _src.indexOf(_separateChr, currentIndex);
        if (startIndex == -1) {
          break;
        }
        var endIndex = _src.indexOf(_separateChr, startIndex + 1);
        if (endIndex == -1) {
          break;
        }
        var hashId = _src.substring(startIndex + 1, endIndex);
        if (_hash[hashId] != null) {
          var hashcontent = _hash[hashId];
          _src = _src.substr(0, startIndex) + hashcontent + _src.substr(endIndex + 1);
          currentIndex = startIndex;
        } else {
          currentIndex = endIndex;
        }
      }
      _src = _src.replace(/^~\//g, 'publication/');
      return _src;
    }

    WLUtils.getTimeStamp = function () {
      var date = new Date();

      function pad2(n) {
        return (n < 10 ? '0' : '') + n;
      }

      return date.getFullYear() +
        pad2(date.getMonth() + 1) +
        pad2(date.getDate()) +
        pad2(date.getHours()) +
        pad2(date.getMinutes()) +
        pad2(date.getSeconds());
    }

    WLUtils.getRestrictRect = function(_objRect, _refRect) {

        var newArea = {};
        var ratioTally = _refRect.height / _refRect.width;

        //get ref h/w ratio
        var ratioRef = _objRect.height / _objRect.width;
        if (isNaN(ratioRef)){
          return _objRect;
        }
        var new_x = _objRect.width;
        var new_y = _objRect.height;

        var factor;
        //choose from height or width
        if (ratioRef <= ratioTally) {
            factor = _refRect.width / _objRect.width;
            new_x = _refRect.width;
            new_y *= factor;
        } else {
            factor = _refRect.height / _objRect.height;
            new_y = _refRect.height;
            new_x *= factor;
        }
        //set width and height
        newArea.width = new_x;
        newArea.height = new_y;
        newArea.x = (_refRect.width - newArea.width) / 2 + _refRect.x;      
        newArea.y = (_refRect.height - newArea.height) / 2 + _refRect.y;
        
        return newArea;
    }

    WLUtils.getTodayDate = function () {
      var propsDate = [];
      var date = new Date();
      propsDate.push(TextHelpers.paddStr(modifiedDate.getDate(), "0", 2));
      propsDate.push(TextHelpers.paddStr(modifiedDate.getMonth() + 1, "0", 2));
      propsDate.push(TextHelpers.paddStr(modifiedDate.getFullYear(), "0", 4));
      return propsDate.join("/");
    }

    //loads a text file async, callback keeps the class scope
    WLUtils.load = function (_url, _callBack, _observer) {
      if (_url == undefined) {
        wpApp.trace("can't load an undefined url");
      }
      var req = new XMLHttpRequest();
      req.open('GET', _url, true);
      //req.callBack = _callBack;
      req.onreadystatechange = function (aEvt) {
        if (req.readyState == 4) {
          if (req.status == 200)
            _callBack.apply(_observer, [req.responseText]);
          else
            wpApp.trace("Erreur pendant le chargement de " + _url);
        }
      };
      req.send(null);
    }

    //this model loads and stores localization data
    function WLLocale() {

      this.strings = {};

      this.init = function () {
        var assetContent = ContextManager().templateManager.getAsset("locale");
        if (assetContent == null) {
          console.log("WLLocale can't init, asset locale not found in the template")
          return;
        }
        this.parse(assetContent);
      }

      this.parse = function (_xml) {

        var parser = new window.DOMParser();
        var xml = parser.parseFromString(_xml, "text/xml");
        var stringsList = xml.querySelectorAll("resources > string");
        for (var i = 0; i < stringsList.length; i++) {
          var string = stringsList[i];
          this.strings[string.getAttribute("name")] = string.firstChild.data;
        }
      }

      this.getString = function (_id) {
        return this.strings[_id];
      }

      this.resolveStrings = function (_src) {
        return WLUtils.resolveVars(_src, this.strings, "#")
      }
    }    

    window.wpApp = new App();
    wpApp.init();

  }();

})();
