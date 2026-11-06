import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import GenerationJob from '../models/GenerationJob.js';
import Question from '../models/Question.js';
import { getGenerationJobStatus } from '../controllers/testController.js';

const originalFindById = GenerationJob.findById;
const originalCountDocuments = Question.countDocuments;

afterEach(() => {
  GenerationJob.findById = originalFindById;
  Question.countDocuments = originalCountDocuments;
});

test('job status reports authoritative verified MCQ count for the job scope', async () => {
  const job = {
    _id: 'job-1',
    boardCode: 'bseb',
    classLevel: '12',
    stream: 'commerce',
    subjectCode: 'acc',
    chapterNumber: 1,
    medium: 'Hindi',
    isHardMode: false,
    status: 'running',
    progressPercent: 0,
    progressMessage: 'Generating MCQs',
    verifiedCount: 0,
    targetCount: 100,
  };
  let countQuery;
  let headers;
  GenerationJob.findById = () => ({ lean: async () => job });
  Question.countDocuments = async (query) => {
    countQuery = query;
    return 3;
  };
  const response = {
    set(name, value) {
      headers = { ...headers, [name]: value };
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };

  await getGenerationJobStatus({ params: { jobId: 'job-1' } }, response);

  assert.equal(response.payload.job.verifiedCount, 3);
  assert.equal(response.payload.job.availableCount, 3);
  assert.equal(countQuery.boardCode, 'bseb');
  assert.equal(countQuery.medium, 'Hindi');
  assert.equal(countQuery.type, 'mcq');
  assert.equal(headers['Cache-Control'], 'no-store');
});
