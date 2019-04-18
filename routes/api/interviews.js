var router = require('express').Router();
var passport = require('passport');
var mongoose = require('mongoose');
mongoose.plugin(schema => { schema.options.usePushEach = true });
var Interview = mongoose.model('Interview');
var User = mongoose.model('User');
var Comment = mongoose.model('Comment');
var auth = require('../auth');

router.post('/', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    var interview = new Interview(req.body.interview);

    interview.author = user;
    //if(interview.author.username != 'saifabuhash') { return res.sendStatus(401); }

    return interview.save().then(function(){
      //console.log(interview.author);
      return res.json({interview: interview.toJSONFor(user)});
    });
  }).catch(next);
});

router.get('/:interview', auth.optional, function(req, res, next) {
  Promise.all([
    req.payload ? User.findById(req.payload.id) : null,
    req.interview.populate('author').execPopulate()
  ]).then(function(results){
    var user = results[0];
    return res.json({interview: req.interview.toJSONFor(user)});
  }).catch(next);
});

router.put('/:interview', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user) {
    if(req.interview.author._id.toString() === req.payload.id.toString()) {
      if(typeof req.body.interview.title !== 'undefined') {
        req.interview.title = req.body.interview.title;
      }

      if(typeof req.body.interview.description !== 'undefined'){
        req.interview.description = req.body.interview.description;
      }

      if(typeof req.body.interview.body !== 'undefined'){
        req.interview.body = req.body.interview.body;
      }

      req.interview.save().then(function(interview){
        return res.json({interview: interview.toJSONFor(user)});
      }).catch(next);
    } else {
      return res.sendStatus(403);
    }
  });
});

router.delete('/:interview', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function() {
  if(req.interview.author._id.toString() === req.payload.id.toString()) {
      return req.interview.remove().then(function() {
        return res.sendStatus(204);
      });
    } else {
      return res.sendStatus(403);
    }
  });
});

router.post('/:interview/favorite', auth.required, function(req, res, next) {
  var interviewId = req.interview._id;

  User.findById(req.payload.id).then(function(user) {
    if(!user) {return res.sendStatus(401); }

    return user.favorite(interviewId).then(function() {
      return req.interview.updateFavoriteCount().then(function(interview) {
        return res.json({interview: interview.toJSONFor(user)});
      });
    });
  }).catch(next);
});

router.delete('/:interview/favorite', auth.required, function(req, res, next) {
  var interviewId = req.interview._id;

  User.findById(req.payload.id).then(function(user) {
    if(!user) {return res.sendStatus(401); }

    return user.unfavorite(interviewId).then(function() {
      return req.interview.updateFavoriteCount().then(function(interview) {
        return res.json({interview: interview.toJSONFor(user)});
      });
    });
  }).catch(next);
});

router.post('/:interview/comments', auth.required, function(req, res, next){
  User.findById(req.payload.id).then(function(user) {
    if(!user) {return res.sendStatus(401); }

    var comment = new Comment(req.body.comment);
    comment.interview = req.interview;
    comment.author = user;

    return comment.save().then(function() {
      req.interview.comments.push(comment);

      return req.interview.save().then(function(interview) {
        res.json({comment: comment.toJSONFor(user)});
      });
    });
  }).catch(next);
});

router.get('/:interview/comments', auth.optional, function(req, res, next){
  Promise.resolve(req.playload ? User.findById(req.payload.id) : null).then(function(user){
    return req.interview.populate({
      path: 'comments',
      populate: {
        path: 'author'
      },
      options: {
        sort: {
          createdAt: 'desc'
        }
      }
    }).execPopulate().then(function(interview) {
      return res.json({comments: req.interview.comments.map(function(comment) {
        return comment.toJSONFor(user);
      })});
    });
  }).catch(next);
});

router.param('comment', function(req, res, next, id){
  Comment.findById(id).then(function(comment){
    if(!comment) {return res.sendStatus(401); }

    req.comment = comment;

    return next();
  }).catch(next);
});

router.delete('/:interview/comments/:comment', auth.required, function(req, res, next){
  if(req.comment.author.toString() === req.payload.id.toString()){
    req.interview.comments.remove(req.comment._id);
    req.interview.save().then(Comment.find({_id: req.comment._id}).remove().exec())
      .then(function(){
        res.sendStatus(204);
      });
  } else {
    res.sendStatus(403);
  }
});

router.get('/', auth.optional, function(req, res, next) {
  var query = {};
  var limit = 20;
  var offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  if(typeof req.query.tag !== 'undefined'){
    query.tagList = {"$in" : [req.query.tag]};
  }

  Promise.all([
   req.query.author ? User.findOne({username: req.query.author}) : null,
   req.query.favorited ? User.findOne({username: req.query.favorited}) : null
 ]).then(function(results){
   var author = results[0];
   var favoriter = results[1];

   if(author){
     query.author = author._id;
   }

   if(favoriter){
     query._id = {$in: favoriter.favorites};
   } else if(req.query.favorited){
     query._id = {$in: []};
   }

  return Promise.all([
    Interview.find(query)
      .limit(Number(limit))
      .skip(Number(offset))
      .sort({createdAt: 'desc'})
      .populate('author')
      .exec(),
    Interview.count(query).exec(),
    req.payload ? User.findById(req.payload.id) : null,
  ]).then(function(results){
    var interviews = results[0];
    var interviewsCount = results[1];
    var user = results[2];

    return res.json({
      interviews: interviews.map(function(interview){
        return interview.toJSONFor(user);
      }),
      interviewsCount: interviewsCount
    });
  });
}).catch(next);
});

router.param('interview', function(req, res, next, slug) {
  Interview.findOne({ slug: slug})
    .populate('author')
    .then(function (interview) {
      if (!interview) { return res.sendStatus(404); }

      req.interview = interview;
      interview.comments = interview.comments || [];

      return next();
    }).catch(next);
});

module.exports = router;
