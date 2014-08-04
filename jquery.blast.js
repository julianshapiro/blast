/***************
    Details
***************/

/*!
* Blast.js: Blast text apart to make it manipulable.
* @version 0.1.1
* @docs julian.com/research/blast
* @license Copyright 2014 Julian Shapiro. MIT License: http://en.wikipedia.org/wiki/MIT_License
*/  

;(function ($, window, document, undefined) {

    /*********************
       Helper Functions
    *********************/

    /* IE detection. Gist: https://gist.github.com/julianshapiro/9098609 */
    var IE = (function () { 
        if (document.documentMode) {
            return document.documentMode;
        } else {
            for (var i = 7; i > 0; i--) {
                var div = document.createElement("div");

                div.innerHTML = "<!--[if IE " + i + "]><span></span><![endif]-->";

                if (div.getElementsByTagName("span").length) {
                    div = null;

                    return i;
                }

                div = null;
            }
        }

        return undefined;
    })();

    /* Shim to prevent console.log() from throwing errors on IE<=7. */
    var console = window.console || { log: function () {} };

    /*****************
        Constants
    *****************/

    var pluginName = "blast",
        characterRanges = {
            latinPunctuation: "–—′’'“″„\"(«.…¡¿′’'”″“\")».…!?",
            latinLetters: "\\u0041-\\u005A\\u0061-\\u007A\\u00C0-\\u017F\\u0100-\\u01FF\\u0180-\\u027F"
        },
        Reg = {
            /* If the abbreviations RegEx is missing a title abbreviation that you find yourself needing to often escape manually, tweet me: @Shapiro. */
            abbreviations: new RegExp("[^" + characterRanges.latinLetters + "](e\\.g\\.)|(i\\.e\\.)|(mr\\.)|(mrs\\.)|(ms\\.)|(dr\\.)|(prof\\.)|(esq\\.)|(sr\\.)|(jr\\.)[^" + characterRanges.latinLetters + "]", "ig"),
            innerWordPeriod: new RegExp("[" + characterRanges.latinLetters + "]\.[" + characterRanges.latinLetters + "]", "ig"),
            onlyContainsPunctuation: new RegExp("[^" + characterRanges.latinPunctuation + "]"),
            adjoinedPunctuation: new RegExp("^[" + characterRanges.latinPunctuation + "]+|[" + characterRanges.latinPunctuation + "]+$", "g"),
            skippedElements: /(script|style|select|textarea)/i,
            hasPluginClass: new RegExp("(^| )" + pluginName + "( |$)", "gi")
        };

    /*************************
       Punctuation Escaping
    *************************/ 

    /* Escape likely false-positives for sentence-final periods. Escaping is performed by converting a character into its ASCII equivalent and wrapping it in double curly brackets. */
    function escapePeriods (text) {
        /* Escape the following Latin abbreviations and English titles: e.g., i.e., Mr., Mrs., Ms., Dr., Prof., Esq., Sr., and Jr. */
        text = text.replace(Reg.abbreviations, function(match) {
            return match.replace(/\./g, "{{46}}");
        });

        /* Escape inner-word (non-space-delimited) periods, e.g. Blast.js. */
        text = text.replace(Reg.innerWordPeriod, function(match) {
            return match.replace(/\./g, "{{46}}");
        });

        return text;
    }

    /* decodePunctuation() is used to decode the output of escapePeriods() and punctuation that has been manually escaped by users. */
    function decodePunctuation (text) {
        return text.replace(/{{(\d{1,3})}}/g, function(fullMatch, subMatch) {
            return String.fromCharCode(subMatch);
        }); 
    }

    /***********************
       Wrapper Generation
    ***********************/ 

    function wrapNode (node, opts) {
        var wrapper = document.createElement(opts.tag);

        /* At minimum, assign the element a class of "blast". */
        wrapper.className = pluginName;

        if (opts.customClass) {
            wrapper.className += " " + opts.customClass;

            /* generateIndexID: If an opts.customClass is provided, generate an ID consisting of customClass and a number indicating this match's iteration. */
            if (opts.generateIndexID) {
                wrapper.id = opts.customClass + "-" + Element.blastedCount;
            }
        }

        /* generateValueClass: Assign the element a class equal to its escaped inner text. Only applicable to the character and word delimiters (since they do not contain spaces). */
        if (opts.generateValueClass === true && (opts.delimiter === "character" || opts.delimiter === "word")) {
            var valueClass,
                text = node.data;

            /* For the word delimiter, remove adjoined punctuation, which is unlikely to be desired as part of the match. */
            /* But, if the text consists purely of punctuation characters (e.g. "!!!"), leave the text as it is. */
            if (opts.delimiter === "word" && Reg.onlyContainsPunctuation.test(text)) {
                /* E: Remove punctuation that's adjoined to either side of the word match. */
                text = text.replace(Reg.adjoinedPunctuation, "");
            }

            valueClass = pluginName + "-" + opts.delimiter + "-" + text.toLowerCase();

            wrapper.className += " " + valueClass;
        }

        wrapper.appendChild(node.cloneNode(false));

        return wrapper;
    }

    /******************
       DOM Traversal
    ******************/ 

    function traverseDOM (node, opts) {
        var matchPosition = -1,
            skipNodeBit = 0;

        /* Only proceed if the node is a text node and isn't empty. */
        if (node.nodeType === 3 && node.data.length) {
            /* Perform punctuation encoding/decoding once per original whole text node (before it gets split up into bits). */
            if (Element.nodeBeginning) {
                /* For the sentence delimiter, we escape likely false-positive sentence-final punctuation before we execute the RegEx. */
                /* For all other delimiters, we must decode manually-escaped punctuation so that the RegEx can match correctly. */
                node.data = (opts.delimiter === "sentence") ? escapePeriods(node.data) : decodePunctuation(node.data);

                Element.nodeBeginning = false;
            }

            matchPosition = node.data.search(Element.delimiterRegex);

            /* If there's a RegEx match in this text node, proceed with element wrapping. */
            if (matchPosition !== -1) {
                var match = node.data.match(Element.delimiterRegex),
                    matchText = match[0],
                    subMatchText = match[1] || false;

                Element.blastedCount++;

                /* RegEx queries that can return empty strings (e.g ".*") produce an empty matchText which throws the entire traversal process into an infinite loop due to the position index not incrementing.
                   Thus, we bump up the position index manually, resulting in a zero-width split at this location followed by the continuation of the traversal process. */
                if (matchText === "") {
                    matchPosition++;
                /* If a RegEx submatch is produced that is not identical to the full string match, assume the submatch's index position and text. This technique allows us to avoid writing multi-part RegEx queries. */
                } else if (subMatchText && subMatchText !== matchText) {
                    matchPosition += matchText.indexOf(subMatchText);
                    matchText = subMatchText;
                }

                /* Split this text node into two separate nodes at the position of the match, returning the node that begins after the match position. */
                var middleBit = node.splitText(matchPosition);

                /* Split the newly-produced text node at the end of the match's text so that middleBit is a text node that consists solely of the matched text. 
                   The other newly-created text node, which begins at the end of the match's text, is what will be traversed in the subsequent loop (in order to find additional matches in the same original text node). */
                middleBit.splitText(matchText.length);

                /* Over-increment the loop counter (see below) so that we skip the extra node (middleBit) that we've just created (and already processed). */
                skipNodeBit = 1;

                /* We couldn't previously decode punctuation for the sentence delimiter. We do so now. */
                if (opts.delimiter === "sentence") { 
                    middleBit.data = decodePunctuation(middleBit.data);
                }

                var wrappedNode = wrapNode(middleBit, opts, Element.blastedCount);

                /* Replace the middleBit node with its wrapped version. */  
                middleBit.parentNode.replaceChild(wrappedNode, middleBit);

                /* Push the wrapper onto the Call.generatedElements array. */
                Call.generatedElements.push(wrappedNode);

                /* Note: We use this slow splice-then-iterate method because every match needs to be converted into an HTML element node. A text node's text cannot have HTML elements inserted into it. */
                /* Todo: To improve performance, use documentFragments to delay node manipulation so that DOM queries and updates can be batched across elements. */
            }
        /* Traverse the DOM tree until we find text nodes. Skip script and style elements. Skip select and textarea elements (which contain text nodes that cannot/should not be wrapped). 
           Additionally, check for the existence of our plugin's class to ensure that we do not traverse pre-Blasted elements. */
        /* Note: The basic DOM traversal technique is copyright Johann Burkard <http://johannburkard.de>. Licensed under the MIT License: http://en.wikipedia.org/wiki/MIT_License */
        } else if (node.nodeType === 1 && node.hasChildNodes() && !Reg.skippedElements.test(node.tagName) && !Reg.hasPluginClass.test(node.className)) {  
            /* Note: We don't cache childNodes' length since it's a live nodeList (which changes dynamically with the use of splitText() above). */
            for (var i = 0; i < node.childNodes.length; i++) {
                Element.nodeBeginning = true;  
                i += traverseDOM(node.childNodes[i], opts);
            }
        }

        return skipNodeBit;
    }

    /*******************
       Call Variables
    *******************/

    /* Call-specific data dontainer. */
    var Call = {
            /* Keep track of the elements generated by Blast so that they can optionally be pushed onto the jQuery call stack. */
            generatedElements: []
        }, 
        /* Element-specific data container. */
        Element = {};

    /****************
       $.fn.blast
    ****************/

    $.fn.blast = function (options) {

        /*****************
           Known Issues
        *****************/

        /* In <=IE7, when Blast is called on the same element more than once with opts.stripHTMLTags=false, calls after the first may not target the entirety of the element and/or may inject excess spacing between inner text parts due to <=IE7's faulty node normalization. */

        /******************
           Call Options
        ******************/

        var opts = $.extend({}, $.fn[pluginName].defaults, options);

        /**********************
           Element Iteration
        **********************/ 

        this.each(function() {
            var $this = $(this)

            /* When anything except false is passed in for the options object, Blast is initiated. */
            if (options !== false) {

                /**********************
                   Element Variables
                **********************/ 

                Element = {
                    delimiterRegex: null,
                    blastedCount: 0,
                    nodeBeginning: false
                };

                /*****************
                   Housekeeping
                *****************/  

                /* Unless a consecutive opts.search is being performed, reverse the current Blast call on the target element before proceeding. */
                /* Note: When traversing the DOM, Blast skips wrapper elements that it's previously generated. */
                if ($this.data(pluginName) !== undefined && ($this.data(pluginName).delimiter !== "search" || !opts.search)) {
                    /* De-Blast the previous call before continuing. */
                    reverse($this, opts);

                    if (opts.debug) console.log(pluginName + ": Removing element's existing Blast call and re-running.");
                }

                /* Store the current delimiter type so that it can be compared against on subsequent calls (see above). */
                $this.data(pluginName, {
                    delimiter: opts.search ? "search" : opts.delimiter
                });

                /* Reset the Call.generatedElements array for each target element. */
                Call.generatedElements = [];

                /****************
                   Preparation
                ****************/ 

                /* opts.tag is the only parameter that can cause Blast to throw an error (due to the user inputting unaccepted characters). So, we cleanse that property. */
                try {
                    /* Note: The garbage collector will automatically remove this since we're not assigning it to a variable. */
                    document.createElement(opts.tag);
                } catch (error) { 
                    opts.tag = "span";

                    if (opts.debug) console.log(pluginName + ": Invalid tag supplied. Defaulting to span.");
                }

                /* Assign the target element a root class for reference purposes when reversing Blast. */
                $this.addClass(pluginName + "-root");

                if (opts.debug) console.time("blast");

                /***********
                   Search
                ***********/

                /* Ensure that the opts.delimiter parameter for searching is a string with a non-zero length. */
                if (opts.search === true && $.type(opts.delimiter) === "string" && $.trim(opts.delimiter).length) {
                    /* Since the search is performed as a RegEx, we remove RegEx meta-characters from the search string. */
                    opts.delimiter = opts.delimiter.replace(/[-[\]{,}(.)*+?|^$\\\/]/g, "\\$&");

                    /* Note: This includes the possessive apostrophe-s form as a match: {STRING}'s. */
                    /* Note: This will not match text that is part of a compound word (two words adjoined with a dash), e.g. "front-end" won't result in a match for "front". */
                    /* Note: Based on the way the algorithm is implemented, it is not possible to search for a string that consists solely of punctuation characters. */
                    /* Note: By creating boundaries at Latin alphabet ranges instead of merely spaces, we effectively match phrases that are inlined alongside any type of non-Latin-letter, e.g. word|, word!, ♥word♥ will all match. */
                    Element.delimiterRegex = new RegExp("(?:[^-" + characterRanges.latinLetters + "])(" + opts.delimiter + "('s)?)(?![-" + characterRanges.latinLetters + "])", "i");

                /***************
                   Delimiters
                ***************/

                } else {
                    /* Normalize the string's case for the delimiter switch below. */
                    if ($.type(opts.delimiter) === "string") {
                        opts.delimiter = opts.delimiter.toLowerCase();
                    }                        

                    switch (opts.delimiter) {
                        case "letter":
                        case "char":
                        case "character":
                            /* Matches every non-space character. */
                            /* Note: The character delimiter is unique in that it makes it cumbersome for some screenreaders to read Blasted text — since each letter will be read one-at-a-time. Thus, when using the character delimiter,
                                     it is recommended that your use of Blast is temporary, e.g. to animate letters into place before reversing Blast. */
                            /* Note: This is the slowest delimiter. However, its slowness is only truly noticeable when it's used on larger bodies of text (of over 500 characters) on <=IE8. Run Blast with opts.debug=true to monitor execution times. */
                            Element.delimiterRegex = /(\S)/;
                            break;

                        case "word":
                            /* Matches strings between space characters. */
                            /* Note: Matches will include punctuation that's adjoined with the word, e.g. "Hey!" is a full match. */
                            /* Note: Remember that every element marks the start of a new string. Thus, "in<b>si</b>de" will match as three separate words. */
                            Element.delimiterRegex = /\s*(\S+)\s*/;
                            break;

                        case "sentence":
                            /* Matches phrases either ending in Latin alphabet punctuation or located at the end of the text. (Linebreaks are not considered punctuation.) */
                            /* Note: If you don't want punctuation to demarcate a sentence match, replace the punctuation character with {{ASCII_CODE_FOR_DESIRED_PUNCTUATION}}. ASCII Codes: .={{46}}, ?={{63}}, !={{33}} */
                            Element.delimiterRegex = /(?=\S)(([.]{2,})?[^!?]+?([.…!?]+|(?=\s+$)|$)(\s*[′’'”″“")»]+)*)/;
                            /* RegExp explanation (Tip: Use Regex101.com to play around with this expression and see which strings it matches): 
                               - Expanded view: /(?=\S) ( ([.]{2,})? [^!?]+? ([.…!?]+|(?=\s+$)|$) (\s*[′’'”″“")»]+)* )
                               - (?=\S) --> Match must contain a non-space character.
                               - ([.]{2,})? --> Match may begin with a group of periods.
                               - [^!?]+? --> Grab everything that isn't an unequivocally-terminating punctuation character, but stop at the following condition...
                               - ([.…!?]+|(?=\s+$)|$) --> Match the last occurrence of sentence-final punctuation or the end of the text (optionally with left-side trailing spaces).
                               - (\s*[′’'”″“")»]+)* --> After the final punctuation, match any and all pairs of (optionally space-delimited) quotes and parentheses.
                            */
                            break;

                        case "element":
                            /* Matches text between HTML tags. */
                            /* Note: Wrapping always occurs inside of elements, i.e. <b><span class="blast">Bolded text here</span></b>. */
                            Element.delimiterRegex = /(?=\S)([\S\s]*\S)/;
                            break;

                        /*****************
                           Custom Regex
                        *****************/

                        default:
                            if (opts.delimiter instanceof RegExp) {
                                Element.delimiterRegex = opts.delimiter;
                            } else {
                                console.log(pluginName + ": Unrecognized delimiter, empty search string, or invalid custom RegEx. Aborting.");

                                /* Clean up what was performed under the Housekeeping section. */
                                $this.blast(false);

                                /* Abort this Blast call. */
                                return true;
                            }
                    }
                }

                /* Perform HTML tag stripping if requested. */
                if (opts.stripHTMLTags) {
                    $this.html($this.text());
                }

                /* Initiate the DOM traversal process. */
                traverseDOM(this, opts);
            
            /* When false is passed in as the options object, Blast is reversed. */
            } else if (options === false && $this.data(pluginName)) {
                reverse($this, opts);
            }

            /**************
               Debugging
            **************/

            if (opts.debug) {
                console.timeEnd("blast");

                $this.find(".blast")
                    .each(function () {
                        console.log(pluginName + " [" + opts.delimiter + "] " + $(this)[0].outerHTML);
                    })
                    .filter(":even")
                        .css("backgroundColor", "#f12185")
                        .end()
                    .filter(":odd")
                        .css("backgroundColor", "#075d9a");
           }
        });

        /*************
            Chain
        *************/ 

        /* Either return a stack composed of our call's generatedElements or return the element(s) originally targeted by this Blast call. */
        /* Note: returnGenerated can only be disabled on a per-call basis (not a per-element basis), and thus a single check is performed to see if it was explicitly set to false in the call options object. */
        if (options !== false && opts.returnGenerated === true) {
            return this.pushStack(Call.generatedElements);
        } else {
            return this;
        }
    };

    /************
       Reverse
    ************/ 

    function reverse ($this, opts) {
        if (opts.debug) console.time("blast reversal");

        var skippedDescendantRoot = false;

        $this
            .removeClass(pluginName + "-root")
            .removeData(pluginName)
            .find("." + pluginName)
                .each(function () {
                    var $this = $(this);

                    /* Do not reverse Blast on descendant root elements. (Before you can reverse Blast on an element, you must reverse Blast on any parent elements that have been Blasted.) */
                    if (!$this.closest("." + pluginName + "-root").length) {
                        var thisParentNode = this.parentNode;
                        
                        /* This triggers some sort of node layout, thereby solving a node normalization bug in <=IE7 for reasons unknown. If you know the specific reason, tweet me: @Shapiro. */
                        if (IE <= 7) (thisParentNode.firstChild.nodeName);

                        /* Strip the HTML tags off of the wrapper elements by replacing the elements with their child node's text. */
                        thisParentNode.replaceChild(this.firstChild, this);

                        /* Normalize() parents to remove empty text nodes and concatenate sibling text nodes. This cleans up the DOM after our manipulation. */
                        thisParentNode.normalize();
                    } else {
                        skippedDescendantRoot = true;
                    }
                });

        if (opts.debug) {
            console.log(pluginName + ": Reversed Blast" + ($this.attr("id") ? " on #" + $this.attr("id") + "." : ".") + (skippedDescendantRoot ? " Skipped reversal on the children of one or more descendant root elements." : ""));
            console.timeEnd("blast reversal");
        }
    }
})(jQuery, window, document);

/***************
    Defaults
***************/

$.fn.blast.defaults = {
    returnGenerated: true,
    delimiter: "word",
    tag: "span",
    search: false,
    customClass: "",
    generateIndexID: false,
    generateValueClass: false,
    stripHTMLTags: false,
    debug: false
};