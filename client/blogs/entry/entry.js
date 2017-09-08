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

// height of a space between text content of a post and the next post header
const TOP_OFFSET = 50;


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  pageState.user_hid  = data.params.user_hid;
  pageState.entry_hid = data.params.entry_hid;

  let anchor = data.anchor || '';

  if (anchor.match(/^#comment\d+$/)) {
    let el = $('.blog-comment' + anchor);

    if (el.length) {
      // override automatic scroll to an anchor in the navigator
      data.no_scroll = true;

      $window.scrollTop(el.offset().top - navbarHeight - TOP_OFFSET);
      el.addClass('blog-comment__m-flash');

      return;
    }
  }
});


// Set up handlers for toolbar buttons
//
N.wire.on('navigate.done:' + module.apiPath, function setup_blog_entry_handlers() {
  return N.wire.emit('blogs.blocks.blog_entry');
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

  // Display confirmation when answering to an old comment
  //
  N.wire.before(module.apiPath + ':reply', function old_reply_confirm(data) {
    if (data.$this.data('comment-id')) {
      let comment_time = new Date(data.$this.data('comment-ts')).getTime();
      let comment_older_than_days = Math.floor((Date.now() - comment_time) / (24 * 60 * 60 * 1000));

      if (comment_older_than_days >= N.runtime.page_data.settings.blogs_reply_old_comment_threshold) {
        return N.wire.emit('common.blocks.confirm', {
          html: t('old_comment_reply_confirm', { count: comment_older_than_days })
        });
      }
    } else {
      let entry_older_than_days = Math.floor(
        (Date.now() - new Date(N.runtime.page_data.entry.ts)) / (24 * 60 * 60 * 1000)
      );

      if (entry_older_than_days >= N.runtime.page_data.settings.blogs_reply_old_comment_threshold) {
        return N.wire.emit('common.blocks.confirm', {
          html: t('old_entry_reply_confirm', { count: entry_older_than_days })
        });
      }
    }
  });


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
