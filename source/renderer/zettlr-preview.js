/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        ZettlrPreview class
 * CVM-Role:        Controller
 * Maintainer:      Hendrik Erz
 * License:         MIT
 *
 * Description:     Controls the file list in the preview pane.
 *
 * END HEADER
 */

const Clusterize = require('clusterize.js');
const { formatDate } = require('../common/zettlr-helpers.js');
// Sorting icons (WebHostingHub-Glyphs)
const SORT_NAME_UP = '&#xf1c2;'
const SORT_NAME_DOWN = '&#xf1c1;';
const SORT_TIME_UP = '&#xf1c3;';
const SORT_TIME_DOWN = '&#xf1c4;';

/**
 * This class represents the file tree as a two-dimensional list. It makes use
 * of the ListView class to actually render the list. It is rather similar to
 * the ZettlrDirectories class, but ZettlrPreview handles searches as well,
 * which makes the big share of the class's functionality.
 */
class ZettlrPreview
{
    /**
     * Initialize
     * @param {ZettlrRenderer} parent The renderer object
     */
    constructor(parent)
    {
        this._renderer           = parent;
        this._snippets           = true;
        this._selectedFile       = null;

        this._data               = [];
        this._tags               = [];

        // Elements
        this._div                = $('#preview');
        this._listContainer      = $('<ul>').attr('id', 'filelist').appendTo(this._div);
        this._list               = new Clusterize({
            rows: this._data,
            scrollId: 'preview',
            contentId: 'filelist',
            show_no_data_row: false, // Don't show a "no data" element
            callbacks: {
                // Draggables need to be created from existing DOM elements
                clusterChanged: () => { this._updateDraggable(); }
            }
        });

        // Search related
        this._hashes             = null;
        this._currentSearch      = null;
        this._currentSearchIndex = 0;
        this._results            = []; // Saves all search results
        this._showSearchResults  = false; // Indicates whether or not _gen() should include negative search results.

        // Activate event listeners
        this._act();
    }

    /**
     * Refreshes the list with new data
     * @param  {Object} data A ZettlrDir tree object
     * @return {ListView}      Chainability.
     */
    refresh(data = this._renderer.getCurrentDir())
    {
        this._data = data || [];
        // Potentially re-select the current file
        if(this._renderer.getCurrentFile()) {
            this._selectedFile = this._renderer.getCurrentFile().hash;
        } else {
            this._selectedFile = null;
        }
        delete this._tags;
        this._gen(); // Generate all tags
        this._list.update(this._tags);
        // Afterwards, update the draggables
        this._updateDraggable();
        return this;
    }

    /**
     * Generates the HTML code as string that will be used by Clusterize.js to display elements.
     * @param  {Number} [index=-1] If given and in bounds of element count, will only regenerate this index.
     * @return {void}            No return.
     */
    _gen(index = -1)
    {
        if(!Array.isArray(this._data)) {
            this._data = this._flattenTree(this._data);
        }
        let start = 0;
        let until = this._data.length;
        if(index > -1 && index < this._data.length) {
            // Regenerate the specified index
            let start = index;
            let until = index+1;
            this._tags = new Array(this._data.length);
        }

        this._tags = [];

        // Traverse the flattened data-array and replace each object with its
        // representation as an HTML string
        for(let i = start; i < until; i++) {
            let d = this._data[i];
            if(this._showSearchResults && !this._results.find((elem) => { elem.hash == d.hash })) {
                // Don't include no-result-rows in the next list.
                continue;
            }
            let sort = (d.type == 'directory') ? `data-sorting="${d.sorting}" ` : '';
            let selected = (this._selectedFile && this._selectedFile == d.hash) ? ` selected` : '';
            let elem = `<li class="${d.type}${selected}" data-hash="${d.hash}" ${sort}title="${d.name}">`;
            if(d.type == 'directory') {
                // Render a directory
                elem += d.name;
            } else if (d.type == 'file') {
                elem += `<strong>${d.name.substr(0, d.name.lastIndexOf('.'))}</strong>`;

                if(this._snippets) {
                    elem += `<br><span class="snippet">${d.snippet}
                    <small>${formatDate(new Date(d.modtime))}</small></span>`;
                }
            }
            elem += '</li>'; // Close the tag
            this._tags.push(elem);
        }
    }

    /**
     * Updates the draggables. Is called everytime a new cluster is rendered.
     * @return {void} No return.
     */
    _updateDraggable()
    {
        this._listContainer.find('li.file').draggable({
            'cursorAt': { 'top': 0, 'left': 0},
            'scroll': false,
            'helper': function() {
                // Return a clone attached to the body (movable through the whole view)
                // and that has the same CSS classes
                return $(this)
                .clone()
                .appendTo('body')
                .css('z-index', 1000)
                .css('height', $(this).innerHeight())
                .css('width', $(this).innerWidth())
                .css('background-color', $(this).css('background-color'))
                .css('color', $(this).css('color'))
                .css('font-family', $(this).css('font-family'))
                .css('padding', $(this).css('padding'))
                .css('margin', $(this).css('margin'))
                .css('list-style-type', $(this).css('list-style-type'));
            },
            'revert': "invalid", // Only revert if target was invalid
            'revertDuration': 200,
            'distance': 5,
        });
    }

    /**
     * This function flattens an object tree (file tree) to an array.
     * @param  {Object} data        A ZettlrDir tree
     * @param  {Array}  [newarr=[]] Needed for recursion
     * @return {Mixed}             An array or nothing.
     */
    _flattenTree(data, newarr = [])
    {
        // In case of completely empty stuff, simply return an empty array
        if(data == null || data.length === 0) {
            return [];
        }

        if(data.type == "file") {
            return newarr.push(data);
        } else if(data.type == "directory") {
            // Append directory (for easier overview)
            newarr.push(data);
            if(data.children != null) {
                for(let c of data.children) {
                    newarr.concat(this._flattenTree(c, newarr));
                }
            }
            return newarr;
        }
    }

    /**
     * Empties the list.
     * @return {ZettlrPreview} Chainability.
     */
    _empty()
    {
        // Simply refresh with an empty array.
        return this.refresh([]);
    }

    _act()
    {
        // Activate directories and files respectively.
        this._listContainer.on('click', 'li.file', (e) => {
            let elem = $(e.target);
            while(!elem.is('li') && !elem.is('body')) {
                // Click may have occurred on a span or strong
                elem = elem.parent();
            }

            if(elem.hasClass('selected')) {
                return;
            }

            this.requestFile(elem.attr('data-hash'));
        });

        this._listContainer.on('mouseenter', 'li.directory', (e) => {
            if(this._listContainer.find('.sorter').length > 0) {
                // There is already a sorter in the div.
                return;
            }
            let sort = $(e.target).attr('data-sorting'), sortNameIcon, sortTimeIcon;

            if(sort == 'name-up') {
                sortNameIcon = SORT_NAME_UP;
                sortTimeIcon = SORT_TIME_DOWN;
            } else if(sort == 'name-down') {
                sortNameIcon = SORT_NAME_DOWN;
                sortTimeIcon = SORT_TIME_DOWN;
            } else if(sort == 'time-up') {
                sortTimeIcon = SORT_TIME_UP;
                sortNameIcon = SORT_NAME_DOWN;
            } else if(sort == 'time-down') {
                sortTimeIcon = SORT_TIME_DOWN;
                sortNameIcon = SORT_NAME_DOWN;
            } else {
                sortTimeIcon = SORT_TIME_UP;
                sortNameIcon = SORT_NAME_UP;
            }

            let sortingHeader = $(`<div class="sorter"><span class="sortName">${sortNameIcon}</span><span class="sortTime">${sortTimeIcon}</span></div>`);
            sortingHeader.click((e) => {
                let elem = $(e.target);
                // We need the hex charcode as HTML entity. jQuery is not as
                // nice as to give it back to us itself.
                let sort = "&#x" + elem.text().charCodeAt(0).toString(16) + ';';
                if(sort == SORT_NAME_UP) {
                    this.sortDir(elem.parent().parent().attr('data-hash'), 'name-down');
                } else if(sort == SORT_TIME_UP) {
                    this.sortDir(elem.parent().parent().attr('data-hash'), 'time-down');
                } else if(sort == SORT_NAME_DOWN) {
                    this.sortDir(elem.parent().parent().attr('data-hash'), 'name-up');
                } else if(sort == SORT_TIME_DOWN) {
                    this.sortDir(elem.parent().parent().attr('data-hash'), 'time-up');
                }
            });
            $(e.target).append(sortingHeader);
        });

        this._listContainer.on('mouseleave', 'li.directory', (e) => {
            $(e.target).find('.sorter').detach();
        });

        return this;
    }

    select(hash)
    {
        this._selectedFile = hash;
        let elem = this._listContainer.find('li[data-hash="' + hash + '"]');
        if(elem.length > 0) {
            this._listContainer.find('li.file').removeClass('selected');
            elem.addClass('selected');
        } else {
            // We need a manual refresh because the element currently is not rendered
            for(let i = 0; i < this._data.length; i++) {
                if(this._data[i].hash == hash) {
                    this._gen(i); // Only re-generate this specific index
                    // And push it into clusterize
                    this._list.update(this._tags);
                    break;
                }
            } // This for loop will simply run through each element if the hash does not exist
        }
    }

    /**
     * Needed for bubbling up the request of a new file
     * @param  {Integer} hash The hash of the file that's being requested
     * @return {void}      Nothing to return.
     */
    requestFile(hash)
    {
        // Request a file from the renderer
        this._renderer.requestFile(hash);
    }

    /**
     * Passes the sorting request to the renderer
     * @param  {Number} hash The hash of the dir to be sorted
     * @param  {String} type Either name or time
     */
    sortDir(hash, type) { this._renderer.sortDir(hash, type); }

    /**
     * Toggles the theme
     * @return {ZettlrPreview} Chainability.
     */
    toggleTheme()
    {
        this._div.toggleClass('dark');
        return this;
    }

    /**
     * Toggles the display of the directory tree.
     * @return {ZettlrPreview} Chainability.
     */
    toggleDirectories()
    {
        this._div.toggleClass('no-directories');
        return this;
    }

    /**
     * Toggle the snippets.
     * @return {ZettlrPreview} Chainability.
     */
    toggleSnippets()
    {
        this._snippets = !this._snippets;
        // We need to completely refresh the thing, to make the changes visible.
        this.refresh();
        return this;
    }

    /**
     * The user has requested a search. This function prepares the terms and commences the search.
     * @param  {String} term The value of the search field.
     * @return {void}      Nothing to return.
     */
    beginSearch(term)
    {
        // First sanitize the terms
        let myTerms = [];
        let curWord = "";
        let hasExact = false;
        let operator = 'AND';

        for(let i = 0; i < term.length; i++) {
            let c = term.charAt(i);
            if((c === " ") && !hasExact) {
                // Eat word and next
                if(curWord.trim() !== '') {
                    myTerms.push({ "word": curWord.trim(), "operator": operator });
                    curWord = '';
                    if(operator == 'OR') {
                        operator = 'AND';
                    }
                }
                continue;
            } else if(c === "|") {
                // We got an OR operator
                // So change the last word's operator and set current operator to OR
                operator = 'OR';
                // Take a look forward and if the next char is also a space, eat it right now
                if(term.charAt(i+1) === ' ') {
                    ++i;
                }
                // Also the previous operator should also be set to or
                myTerms[myTerms.length - 1].operator = 'OR';
                continue;
            } else if(c === '"') {
                if(!hasExact) {
                    hasExact = true;
                    continue;
                } else {
                    hasExact = false;
                    myTerms.push({ "word": curWord.trim(), "operator": operator });
                    curWord = '';
                    if(operator == 'OR') {
                        operator = 'AND';
                    }
                    continue;
                }
                // Don't eat the quote;
            }

            curWord += term.charAt(i);
        }

        // Afterwards eat the last word if its not empty
        if(curWord.trim() !== '') {
            myTerms.push({ "word": curWord.trim(), "operator": operator });
        }

        // Now pack together all consecutive ORs to make it easier for the search
        // in the main process
        let currentOr = {};
        currentOr.operator = 'OR';
        currentOr.word = [];
        let newTerms = [];

        for(let i = 0; i < myTerms.length; i++) {
            if(myTerms[i].operator === 'AND') {
                if(currentOr.word.length > 0) {
                    // Duplicate object so that the words are retained
                    newTerms.push(JSON.parse(JSON.stringify(currentOr)));
                    currentOr.word = [];
                }
                newTerms.push(myTerms[i]);
            } else if(myTerms[i].operator === 'OR') {
                currentOr.word.push(myTerms[i].word);
            }
        }

        // Now push the currentOr if not empty
        if(currentOr.word.length > 0) {
            newTerms.push(JSON.parse(JSON.stringify(currentOr)));
        }

        // Now we are all set and can begin the journey. First we need to prepare
        // some things. First: Write the current terms into this object
        // second, listen for search events and third clear everything up when
        // we are done.

        this._hashes = [];
        for(let d of this._data) {
            if(d.type == 'file') {
                this._hashes.push(d.hash);
            }
        }
        this._currentSearch = newTerms;

        // The search index will be increased BEFORE accessing the first file!
        this._currentSearchIndex = -1;

        // Aaaaand: Go!
        this._doSearch();
    }

    /**
     * Do one single search cycle.
     * @return {void} Nothing to return.
     */
    _doSearch()
    {
        if(this._hashes.length == 0) {
            this.endSearch();
            return;
        }

        // We got an array to search through.
        if(this._currentSearchIndex == (this._hashes.length-1)) {
            // End search
            this._renderer.endSearch();
            return;
        }
        if(this._currentSearchIndex > this._hashes.length) {
            this._renderer.endSearch();
            return;
        }

        this._currentSearchIndex++;

        this._renderer.searchProgress(this._currentSearchIndex, this._hashes.length);

        // TODO: Move out send-methods from all files except renderer!
        // Send a request to the main process and handle it afterwards.
        this._renderer.send('file-search', {
            'hash': this._hashes[this._currentSearchIndex],
            'terms': this._currentSearch
        });
    }

    /**
     * Handle the result of the search from main process.
     * @param  {Object} res Contains the search result and the hash.
     * @return {void}     Nothing to return.
     */
    handleSearchResult(res)
    {
        if(res.result.length > 0) {
            this._results.push(res); // For later reference
            let str = this._div.find('li[data-hash="'+res.hash+'"]');
            str.prepend(`<span class="result-counter">(${res.result.length})</span>`);
        }

        // Next search cycle
        this._doSearch();
    }

    /**
     * Ends a search if there are no more hashes to search through.
     * @return {void} Nothing to return.
     */
    endSearch()
    {
        this._currentSearchIndex = 0;
        this._hashes             = [];
        this._currentSearch      = null;
        this._showSearchResults  = true; // Indicate that the list should be only displaying search results.
        this.refresh(); // Refresh to apply.
    }

    // END SEARCH

    /**
     * Update the files displayed.
     * @param  {Object} files A directory tree.
     * @return {ZettlrPreview}       Chainability.
     * @deprecated Will be removed in a further version.
     */
    update(files)
    {
        return this.refresh(files);
    }
}

module.exports = ZettlrPreview;
