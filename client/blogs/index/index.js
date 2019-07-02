'use strict';


const _ = require('lodash');
const ScrollableList = require('nodeca.core/lib/app/scrollable_list');


// Page state
//
// - current_offset:     offset of the current entry (first in the viewport)
// - entry_count:        total amount of entries
//
let pageState = {};
let scrollable_list;

let $window = $(window);


function load(start, direction) {
  return N.io.rpc('blogs.index.list.by_range', {
    start,
    before: direction === 'top' ? N.runtime.page_data.pagination.per_page : 0,
    after:  direction === 'bottom' ? N.runtime.page_data.pagination.per_page : 0
  }).then(res => {
    pageState.entry_count = res.pagination.total;

    return {
      $html: $(N.runtime.render('blogs.blocks.entry_list_mixed', res)),
      locals: res,
      offset: res.pagination.chunk_offset,
      reached_end: res.entries.length !== N.runtime.page_data.pagination.per_page
    };
  });
}


// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let update_url = _.debounce((item, index, item_offset) => {
  let href, state;

  if (item) {
    state = {
      hid:    $(item).data('entry-hid'),
      offset: item_offset
    };
  }

  // save current offset, and only update url if current_item is different
  if (pageState.current_offset !== index) {
    let $query = {};

    if (item) $query.from = $(item).data('entry-hid');

    href = N.router.linkTo('blogs.index', { $query });

    if ((pageState.current_offset >= 0) !== (index >= 0)) {
      $('meta[name="robots"]').remove();

      if (index >= 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      }
    }

    pageState.current_offset = index;
  }

  N.wire.emit('navigate.replace', { href, state })
        .catch(err => N.wire.emit('error', err));
}, 500);


function on_list_scroll(item, index, item_offset) {
  update_url(item, index, item_offset);
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination     = N.runtime.page_data.pagination,
      last_entry_hid = $('.blogs-index').data('last-entry-hid');

  pageState.current_offset     = -1;
  pageState.entry_count        = pagination.total;

  let navbar_height = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);

  // account for some spacing between posts
  navbar_height += 50;

  let scroll_done = false;

  if (!scroll_done && data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    let el = $('#entry' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - navbar_height + data.state.offset);
      scroll_done = true;
    }
  }

  if (!scroll_done && data.params.$query && data.params.$query.from) {
    let el = $('#entry' + Number(data.params.$query.from));

    if (el.length) {
      $window.scrollTop(el.offset().top - navbar_height);
      scroll_done = true;
    }
  }

  // If we're on the first page, scroll to the top;
  // otherwise scroll to the first entry
  //
  if (!scroll_done) {
    if (pagination.chunk_offset > 1 && $('.blogs-index__entry-list').length) {
      $window.scrollTop($('.blogs-index__entry-list').offset().top - navbar_height);

    } else {
      $window.scrollTop(0);
    }

    scroll_done = true;
  }

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  scrollable_list = new ScrollableList({
    N,
    list_selector:               '.blogs-index__entry-list',
    item_selector:               '.blog-entry',
    placeholder_top_selector:    '.blogs-index__loading-prev',
    placeholder_bottom_selector: '.blogs-index__loading-next',
    get_content_id:              post => $(post).data('entry-id'),
    load,
    reached_top:                 pagination.chunk_offset === 0,
    reached_bottom:              last_entry_hid === $('.blogs-index__entry-list > :last').data('entry-hid'),
    index_offset:                pagination.chunk_offset,
    navbar_height,
    // whenever there are more than 150 entries, cut off-screen entries down to 100
    need_gc:                     count => (count > 150 ? count - 100 : 0),
    on_list_scroll
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  scrollable_list.destroy();
  scrollable_list = null;
  update_url.cancel();
  pageState = {};
});


// Set up handlers for buttons in entry-list
//
N.wire.on('navigate.done:' + module.apiPath, function setup_blog_entry_handlers() {
  return Promise.resolve()
             .then(() => N.wire.emit('blogs.blocks.blog_entry'))
             .then(() => N.wire.emit('blogs.blocks.entry_list_mixed'));
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function blogs_index_init_handlers() {

  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    // if the first entry is already loaded, scroll to the top
    if (scrollable_list.reached_top) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'blogs.index',
      params:  {}
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    // if the last entry is already loaded, scroll to the bottom
    if (scrollable_list.reached_bottom) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'blogs.index',
      params: {
        $query: { from: String($('.blogs-index').data('last-entry-hid')) }
      }
    });
  });
});
