'use strict';


const _ = require('lodash');


// Page state
//
// - user_hid:  blog owner hid
// - entry_hid: current blog entry hid
//
let pageState = {};

let $window = $(window);

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  pageState.user_hid  = data.params.user_hid;
  pageState.entry_hid = data.params.entry_hid;
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. show/hide navbar
//
// Unlike on the other pages, this handler does not update progress bar
// (because there isn't one).
//
let progressScrollHandler = null;


N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  progressScrollHandler = _.debounce(function update_progress_on_scroll() {
    // If we scroll below page head, show the secondary navbar
    //
    let head = document.getElementsByClassName('page-head');

    if (head.length && head[0].getBoundingClientRect().bottom > navbarHeight) {
      $('.navbar').removeClass('navbar__m-secondary');
    } else {
      $('.navbar').addClass('navbar__m-secondary');
    }
  }, 100, { maxWait: 100 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(() => {
    $window.on('scroll', progressScrollHandler);
  });

  // execute it once on page load
  progressScrollHandler();
});


N.wire.on('navigate.exit:' + module.apiPath, function progress_updater_teardown() {
  if (!progressScrollHandler) return;
  progressScrollHandler.cancel();
  $window.off('scroll', progressScrollHandler);
  progressScrollHandler = null;
});


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Click on post reply link or toolbar reply button
  //
  N.wire.on(module.apiPath + ':reply', function reply(data) {
    return N.wire.emit('blogs.entry.reply:begin', {
      user_hid:    pageState.user_hid,
      entry_hid:   pageState.entry_hid,
      entry_title: N.runtime.page_data.entry.title,
      comment_id:  data.$this.data('comment-id'),
      comment_hid: data.$this.data('comment-hid')
    });
  });
});
