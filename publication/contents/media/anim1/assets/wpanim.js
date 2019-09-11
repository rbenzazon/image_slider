if(!window.hasOwnProperty("wpApp")){
    function getDomPath(el) {
        var stack = [];
        while ( el.parentNode != null ) {
            console.log(el.nodeName);
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
}else{
    getDomPath = wpApp.getDomPath;
}
var tmpElementPath = getDomPath(document.currentScript).join("");
var WPAnimsClasses = WPAnimsClasses?WPAnimsClasses:{};
console.log(tmpElementPath);
WPAnimsClasses[tmpElementPath] = new function(_tmpElementPath){
    var elementPath = _tmpElementPath;
    this.destroy = function(){
        
    }
    var elements = document.currentScript.parentElement.querySelectorAll("div");
    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (element != null) {
            var animRuleSelectorText = spawnCssRuleAnimation(".slide", element, i);
            element.addEventListener("webkitAnimationStart", myStartFunction);
            element.addEventListener("webkitAnimationEnd", AnimationListener);
            element.addEventListener("animationstart", myStartFunction);
            element.addEventListener("animationend", AnimationListener);
            element.classList.add(animRuleSelectorText.substr(1));
        }
    }

    function spawnCssRuleAnimation(_rule, _element, _incr) {
        var selectorText = _rule;
        var newSelectorText = _rule + elementPath + _incr;
        var styleElement = document.currentScript.parentElement.querySelector("style");
        //for (var i = 0; i < document.styleSheets.length; i++) {
            var styleSheet = styleElement.sheet;
            for (var j = 0; j < styleSheet.cssRules.length; j++) {
                var rule = styleSheet.cssRules[j];

                //identifies the keyframe rule bearing the same name as the class without the point in the beginning
                if ((rule.type == rule.KEYFRAMES_RULE || rule.type == rule.WEBKIT_KEYFRAMES_RULE) && rule.name === selectorText.substr(1)) {
                    var keyFrameRule = rule;
                }
                //identifies the class rule named like the function argument _rule
                if (rule.selectorText == selectorText) {
                    var animationRule = rule;
                    var mainSheet = styleSheet;
                }
            }
        //}

        //do not continue if one of the following is missing
        if (!animationRule || !keyFrameRule) {
            //console.log("rules not found");
            return;
        }

        //duplicate the class rule
        var newRuleText = animationRule.cssText;
        newRuleText = newRuleText.replace(selectorText,newSelectorText);
        mainSheet.insertRule(newRuleText, mainSheet.cssRules.length);
        newRule = mainSheet.cssRules[mainSheet.cssRules.length - 1];

        //alternatively
        /*if(_incr%2 == 0)
    {

        //duplicate the keyframe rule
        var newKeyFrameRuleText = keyFrameRule.cssText;
        var newKeyFrameRuleSelectorText = "@keyframes "+newSelectorText.substr(1);
        //renaming the keyframe rule
        newKeyFrameRuleText = newKeyFrameRuleText.replace("@keyframes "+selectorText.substr(1),newKeyFrameRuleSelectorText);
        mainSheet.insertRule(newKeyFrameRuleText, mainSheet.cssRules.length);
        newKeyFrameRule = mainSheet.cssRules[mainSheet.cssRules.length-1];
        
        //the following line is not supported on keyframe type rules, that's why we replace in the csstext the name of the keyframe rule
        //newKeyFrameRule.selectorText  = newKeyFrameRuleSelectorText;
        
        //sets on the current duplicated class the animation name accordingly to the name of the duplicated keyframe rule
        newRule.style.setProperty("animation-name",newSelectorText.substr(1));
        newRule.style.setProperty("-webkit-animation-name",newSelectorText.substr(1));
        
        
        
        //parses all the keyframe in the keyframe rule
        var keyFrames = newKeyFrameRule.cssRules;
        for(var k=0;k<keyFrames.length;k++)
        {
            keyframe = keyFrames[k];
            //get the transform value of this keyframe
            var transform = keyframe.style.getPropertyValue("transform");
            if(!transform){
                var transform = keyframe.style.getPropertyValue("-webkit-transform");
            }
            //retrieve the values of the translate
            var translateProps = getTransformTranslate(transform);
            translateProps.x *= -1;
            translateProps.y *= -1;
            
            //updates the value of this keyframe by the opposite (move from right or left / top or bottom).
            keyframe.style.setProperty("transform", "translate("+translateProps.x+"px,"+translateProps.y+"px)");
            keyframe.style.setProperty("-webkit-transform", "translate("+translateProps.x+"px,"+translateProps.y+"px)");
            keyframe.style.setProperty("transform", "translate("+translateProps.x+"px,"+translateProps.y+"px)");
        }
    }*/
        
        // item delay
        newRule.style.setProperty("-webkit-animation-delay", (400 * _incr) + "ms");
        newRule.style.setProperty("animation-delay", (400 * _incr) + "ms");
        if(_element.getAttribute("onclick") == null){
            newRule.style.setProperty("pointer-events", "none");
        }
        return newSelectorText;
    }

    function getTransformTranslate(_str) {
        //translate(0px,500px);
        var propName = "translate";
        var startIndex = _str.indexOf(propName);
        if (startIndex == -1) {
            return null;
        }
        var endIndex = _str.indexOf(")", startIndex);
        var content = _str.substr(startIndex + propName.length + 1, endIndex - 1);
        withoutPixels = content.replace("px", "");
        props = withoutPixels.split(",");
        return {
            x: parseFloat(props[0]),
            y: parseFloat(props[1])
        };
    }

    function myStartFunction(e) {
        //console.log("begin anim");
    }

    function AnimationListener(e) {

    }
}(tmpElementPath);