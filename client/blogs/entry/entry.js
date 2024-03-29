'use strict';


// Page state
//
// - user_hid:  blog owner hid
// - entry_hid: current blog entry hid
//
let pageState = {};

let $window = $(window);


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  pageState.user_hid  = data.params.user_hid;
  pageState.entry_hid = data.params.entry_hid;

  let navbar_height = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);

  // account for some spacing between posts
  navbar_height += 50;

  let anchor = data.anchor || '';

  if (anchor.match(/^#comment\d+$/)) {
    let el = $('.blog-comment' + anchor);

    if (el.length) {
      // override automatic scroll to an anchor in the navigator
      data.no_scroll = true;

      $window.scrollTop(el.offset().top - navbar_height);
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


  // Click on reply link or toolbar reply button
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


  // Click report button
  //
  N.wire.on(module.apiPath + ':comment_report', async function comment_report(data) {
    let params = { messages: t('@blogs.abuse_report.messages') };
    let id = data.$this.data('comment-id');

    await N.wire.emit('common.blocks.abuse_report_dlg', params);
    await N.io.rpc('blogs.entry.comment.abuse_report', { comment_id: id, message: params.message });
    await N.wire.emit('notify.info', t('abuse_reported'));
  });


  // Show comment IP
  //
  N.wire.on(module.apiPath + ':comment_show_ip', function comment_show_ip(data) {
    return N.wire.emit('blogs.entry.ip_info_dlg', { comment_id: data.$this.data('comment-id') });
  });


  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + ':comment_bookmark', async function entry_bookmark(data) {
    let $comment   = $('#comment' + data.$this.data('comment-hid'));
    let comment_id = $comment.data('comment-id');
    let remove     = data.$this.data('remove') || false;

    const res = await N.io.rpc('blogs.entry.comment.bookmark', { comment_id, remove });

    if (remove) $comment.removeClass('blog-comment__m-bookmarked');
    else $comment.addClass('blog-comment__m-bookmarked');

    $comment.find('.blog-comment__bookmarks-count').attr('data-bm-count', res.count);
  });


  // Expand deleted or hellbanned comment
  //
  N.wire.on(module.apiPath + ':comment_expand', async function expand(data) {
    let comment_id = data.$this.data('comment-id');

    const res = await N.io.rpc('blogs.entry.comment.get', {
      entry_hid: pageState.entry_hid,
      comment_ids: [ comment_id ]
    });

    let $result = $(N.runtime.render('blogs.entry.blocks.comment_list', Object.assign(res, { expand: true })));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: data.$this.closest('.blog-comment')
    });
  });


  // Add infraction for blog entry
  //
  N.wire.on(module.apiPath + ':entry_add_infraction', async function add_infraction(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');
    let params = { entry_id };

    await N.wire.emit('common.blocks.add_infraction_dlg', params);
    await N.io.rpc('blogs.entry.add_infraction', params);
    const res = await N.io.rpc('blogs.entry.get', { entry_id });

    let $result = $(N.runtime.render('blogs.entry.blocks.entry', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });

    await N.wire.emit('notify.info', t('infraction_added'));
  });


  // Add infraction for a comment
  //
  N.wire.on(module.apiPath + ':comment_add_infraction', async function add_infraction(data) {
    let $comment = $('#comment' + data.$this.data('comment-hid'));
    let comment_id = $comment.data('comment-id');
    let params = { comment_id };

    await N.wire.emit('common.blocks.add_infraction_dlg', params);
    await N.io.rpc('blogs.entry.comment.add_infraction', params);
    const res = await N.io.rpc('blogs.entry.comment.get', {
      entry_hid: pageState.entry_hid,
      comment_ids: [ comment_id ]
    });

    let $result = $(N.runtime.render('blogs.entry.blocks.comment_list', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $comment
    });
  });


  // Click on entry edit button
  //
  N.wire.on(module.apiPath + ':entry_edit', async function edit() {
    let $entry    = $('#entry' + pageState.entry_hid);
    let entry_id  = $entry.data('entry-id');

    await N.wire.emit('blogs.blocks.blog_entry.edit:begin', {
      user_hid:    $entry.data('user-hid'),
      entry_hid:   $entry.data('entry-hid'),
      entry_title: $entry.find('.blog-entry__title').text(),
      entry_id
    });
    const res = await N.io.rpc('blogs.entry.get', { entry_id });

    let $result = $(N.runtime.render('blogs.entry.blocks.entry', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });
  });


  // Click on comment edit button
  //
  N.wire.on(module.apiPath + ':comment_edit', async function edit(data) {
    let comment_hid = data.$this.data('comment-hid');
    let $comment    = $('#comment' + comment_hid);
    let comment_id  = $comment.data('comment-id');

    await N.wire.emit('blogs.entry.comment_edit:begin', {
      user_hid:    pageState.user_hid,
      entry_hid:   pageState.entry_hid,
      entry_title: N.runtime.page_data.entry.title,
      comment_hid,
      comment_id
    });
  });


  // Show history popup
  //
  N.wire.on(module.apiPath + ':comment_history', async function comment_history(data) {
    let comment_id = data.$this.data('comment-id');

    const res = await N.io.rpc('blogs.entry.comment.show_history', { comment_id });
    await N.wire.emit('blogs.entry.comment_history_dlg', res);
  });


  // Vote on blog entry
  //
  N.wire.on(module.apiPath + ':entry_vote', async function entry_vote(data) {
    let $entry   = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');
    let value    = +data.$this.data('value');

    await N.io.rpc('blogs.entry.vote', { entry_id, value });
    const res = await N.io.rpc('blogs.entry.get', { entry_id });

    let $result = $(N.runtime.render('blogs.entry.blocks.entry', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });
  });


  // Vote on blog comment
  //
  N.wire.on(module.apiPath + ':comment_vote', async function comment_vote(data) {
    let $comment   = $('#comment' + data.$this.data('comment-hid'));
    let comment_id = $comment.data('comment-id');
    let value      = +data.$this.data('value');

    await N.io.rpc('blogs.entry.comment.vote', { comment_id, value });
    const res = await N.io.rpc('blogs.entry.comment.get', {
      entry_hid: pageState.entry_hid,
      comment_ids: [ comment_id ]
    });

    let $result = $(N.runtime.render('blogs.entry.blocks.comment_list', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $comment
    });
  });


  // Delete entry
  //
  N.wire.on(module.apiPath + ':delete', async function entry_delete(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');

    let request = {
      entry_id,
      as_moderator: data.$this.data('as-moderator') || false
    };
    let params = {
      canDeleteHard: N.runtime.page_data.settings.blogs_mod_can_hard_delete,
      asModerator: request.as_moderator
    };

    await N.wire.emit('blogs.blocks.blog_entry.entry_delete_dlg', params);

    request.method = params.method;
    if (params.reason) request.reason = params.reason;
    await N.io.rpc('blogs.entry.destroy', request);

    await N.wire.emit('navigate.to', { apiPath: 'blogs.index' });
  });


  // Delete comment handler
  //
  N.wire.on(module.apiPath + ':comment_delete', async function comment_delete(data) {
    let $comment = $('#comment' + data.$this.data('comment-hid'));
    let comment_id = $comment.data('comment-id');

    let request = {
      comment_id,
      as_moderator: data.$this.data('as-moderator') || false
    };
    let params = {
      canDeleteHard: N.runtime.page_data.settings.blogs_mod_can_hard_delete,
      asModerator: request.as_moderator
    };

    await N.wire.emit('blogs.entry.comment_delete_dlg', params);

    request.method = params.method;
    if (params.reason) request.reason = params.reason;
    let res = await N.io.rpc('blogs.entry.comment.destroy', request);

    let removed_ids = res.removed_comment_ids;

    res = await N.io.rpc('blogs.entry.comment.get', {
      entry_hid: pageState.entry_hid,
      comment_ids: removed_ids
    });

    let comment_counter = $('.blogs-entry-page__comment-count');
    comment_counter.attr('data-count', comment_counter.attr('data-count') - removed_ids.length);

    if (res.comments.length === 0) {
      // for users who can't see deleted comments we just show hide animation
      for (let id of removed_ids) {
        let $comment = $(`.blog-comment[data-comment-id='${id}']`);
        $comment.fadeOut(() => $comment.remove());
      }
      return;
    }

    let $result = $(N.runtime.render('blogs.entry.blocks.comment_list', res));

    // remove all child comments then $replace main comment with the entire block
    removed_ids.forEach(id => {
      if (id === comment_id) return;
      let $comment = $(`.blog-comment[data-comment-id='${id}']`);
      $comment.remove();
    });

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $comment
    });
  });


  // Undelete entry
  //
  N.wire.on(module.apiPath + ':undelete', async function entry_undelete(data) {
    let $entry = $('#entry' + data.$this.data('entry-hid'));
    let entry_id = $entry.data('entry-id');

    await N.io.rpc('blogs.entry.undelete', { entry_id });
    const res = await N.io.rpc('blogs.entry.get', { entry_id });

    let $result = $(N.runtime.render('blogs.entry.blocks.entry', res));

    $('#content').removeClass('blogs-entry-page__m-deleted blogs-entry-page__m-deleted-hard');

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $entry
    });

    await N.wire.emit('notify.info', t('entry_undelete_done'));
  });


  // Undelete entry handler
  //
  N.wire.on(module.apiPath + ':comment_undelete', async function comment_undelete(data) {
    let $comment = $('#comment' + data.$this.data('comment-hid'));
    let comment_id = $comment.data('comment-id');

    await N.io.rpc('blogs.entry.comment.undelete', { comment_id });
    const res = await N.io.rpc('blogs.entry.comment.get', {
      entry_hid: pageState.entry_hid,
      comment_ids: [ comment_id ]
    });

    let comment_counter = $('.blogs-entry-page__comment-count');
    comment_counter.attr('data-count', +comment_counter.attr('data-count') + 1);

    let $result = $(N.runtime.render('blogs.entry.blocks.comment_list', res));

    await N.wire.emit('navigate.content_update', {
      $: $result,
      locals: res,
      $replace: $comment
    });
  });


  // Subscription handler
  //
  N.wire.on(module.apiPath + ':subscription', async function subscription(data) {
    let id = data.$this.data('entry-id');
    let params = { subscription: data.$this.data('entry-subscription') };

    await N.wire.emit('blogs.entry.subscription', params);
    await N.io.rpc('blogs.entry.change_subscription', { entry_id: id, type: params.subscription });

    N.runtime.page_data.subscription = params.subscription;

    // Need to re-render reply button and dropdown here
    let templateParams = {
      entry:        N.runtime.page_data.entry,
      settings:     N.runtime.page_data.settings,
      subscription: N.runtime.page_data.subscription
    };

    // render dropdown in menu
    $('.page-actions__dropdown').replaceWith(
      N.runtime.render(module.apiPath + '.blocks.page_actions.dropdown', templateParams));

    // render buttons+dropdown in page head
    $('.page-actions').replaceWith(
      N.runtime.render(module.apiPath + '.blocks.page_actions', templateParams));
  });


  // When user clicks "create dialog" button in usercard popup,
  // add title & link to editor.
  //
  N.wire.before('users.dialog.create:begin', function dialog_create_extend_blog_comments(params) {
    if (!params || !params.ref) return; // no data to extend
    if (!/^blog_comment:/.test(params.ref)) return; // not our data

    let [ , user_hid, entry_hid, comment_hid ] = params.ref.split(':');
    let title = $(`#entry${entry_hid} .blog-entry__title`).text();
    let href  = N.router.linkTo('blogs.entry', { user_hid, entry_hid, $anchor: `comment${comment_hid}` });

    if (title && href) {
      params.text = `Re: [#${comment_hid}, ${title}](${href})\n\n`;
    }
  });
});


///////////////////////////////////////////////////////////////////////////////
// Set a "same page" modifier to all block quotes which point to the same entry
//

// current entry params if we're on an entry page, null otherwise;
let entryParams;


// Set `quote__m-local` or `quote__m-outer` class on every quote
// depending on whether its origin is in the same entry or not.
//
function set_quote_modifiers(selector) {
  // if entryParams is not set, it means we aren't on an entry page
  if (!entryParams) return;

  selector.find('.quote').each(function () {
    let $tag = $(this);

    if ($tag.hasClass('quote__m-local') || $tag.hasClass('quote__m-outer')) {
      return;
    }

    let cite = $tag.attr('cite');

    if (!cite) return;

    let match = N.router.match(cite);

    if (!match) return;

    if (match &&
        match.meta.methods.get === 'blogs.entry' &&
        match.params.entry_hid === entryParams.entry_hid) {

      $tag.addClass('quote__m-local');
    } else {
      $tag.addClass('quote__m-outer');
    }
  });
}


N.wire.on('navigate.done:' + module.apiPath, function set_quote_modifiers_on_init(data) {
  entryParams = data.params;

  set_quote_modifiers($(document));
});


N.wire.on('navigate.content_update', function set_quote_modifiers_on_update(data) {
  set_quote_modifiers(data.$);
});


N.wire.on('navigate.exit:' + module.apiPath, function set_quote_modifiers_teardown() {
  entryParams = null;
});
