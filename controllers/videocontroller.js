const Video = require('../models/video');
const ViewedIP = require('../models/viewedIP');

// GET all videos (for admin dashboard)
exports.getAllVideos = async (req, res) => {
  try {
    const videos = await Video.find({});
    const formatted = {};

    videos.forEach(video => {
      formatted[video.videoId] = {
        views: video.views,
        uploadTime: video.uploadTime.toISOString(),
        title: video.title,
        loading: video.loading
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching all videos:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
};

// POST set view count
exports.setViewCount = async (req, res) => {
  const videoId = req.params.id;
  const { views } = req.body;

  if (typeof views !== 'number' || views < 0) {
    return res.status(400).json({ error: 'Invalid view count' });
  }

  try {
    let video = await Video.findOne({ videoId });
    if (!video) {
      video = new Video({
        videoId,
        views,
        title: `Video ${videoId}`,
        uploadTime: new Date(),
        loading: false
      });
    } else {
      video.views = views;
    }

    await video.save();
    res.json({ success: true, video });
  } catch (err) {
    console.error('Error setting view count:', err);
    res.status(500).json({ error: 'Failed to set view count' });
  }
};

// POST bulk update times
exports.bulkUpdateTimes = async (req, res) => {
  const updates = req.body.updates;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Invalid format. Expected an array.' });
  }

  try {
    const results = [];

    for (const update of updates) {
      const { id, newTime } = update;

      if (!id || !newTime || isNaN(new Date(newTime).getTime())) {
        results.push({ id, success: false, error: 'Invalid ID or time' });
        continue;
      }

      let video = await Video.findOne({ videoId: id });
      if (!video) {
        video = new Video({
          videoId: id,
          views: 0,
          title: `Video ${id}`,
          uploadTime: new Date(newTime),
          loading: false
        });
      } else {
        video.uploadTime = new Date(newTime);
      }

      await video.save();
      results.push({ id, success: true });
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Bulk update error:', err);
    res.status(500).json({ error: 'Bulk update failed' });
  }
};
