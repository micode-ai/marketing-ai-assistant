import { extractReviewComments } from './google-play-sync.service';

describe('extractReviewComments', () => {
  it('finds the developer reply when it is a separate comments entry (not index 0)', () => {
    const comments = [
      { userComment: { text: 'Great app', starRating: 5, lastModified: { seconds: '1700000000' }, reviewerLanguage: 'en' } },
      { developerComment: { text: 'Thanks for the feedback!', lastModified: { seconds: '1700001000' } } },
    ];

    const { userComment, developerComment } = extractReviewComments(comments);

    expect(userComment?.text).toBe('Great app');
    expect(userComment?.starRating).toBe(5);
    expect(developerComment?.text).toBe('Thanks for the feedback!');
  });

  it('returns undefined developerComment when there is no reply', () => {
    const comments = [
      { userComment: { text: 'It is ok', starRating: 3, lastModified: { seconds: '1700000000' }, reviewerLanguage: 'pl' } },
    ];

    const { userComment, developerComment } = extractReviewComments(comments);

    expect(userComment?.text).toBe('It is ok');
    expect(developerComment).toBeUndefined();
  });

  it('handles undefined comments', () => {
    const { userComment, developerComment } = extractReviewComments(undefined);

    expect(userComment).toBeUndefined();
    expect(developerComment).toBeUndefined();
  });
});
