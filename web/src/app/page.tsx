'use client';

import { useState, useEffect, useCallback } from 'react';

interface Target {
  id: number;
  username: string;
  is_active: boolean;
  created_at: string;
  last_scraped_at: string | null;
  followers: number | null;
  following: number | null;
  posts_count: number | null;
}

interface Post {
  id: number;
  username: string;
  shortcode: string;
  url: string;
  type: string;
  caption: string | null;
  post_date: string | null;
  likes: number | null;
  views: number | null;
  comments_count: number | null;
  scraped_at: string;
}

interface ScrapeStatus {
  is_running: boolean;
  username?: string;
  message?: string;
  current?: number;
  total?: number;
  timestamp?: string;
}

export default function Home() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>({ is_running: false });
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const fetchTargets = useCallback(async () => {
    const res = await fetch('/api/targets');
    const data = await res.json();
    setTargets(data);
    setLoading(false);
  }, []);

  const fetchPosts = useCallback(async (username?: string, includeInactive?: boolean) => {
    const params = new URLSearchParams();
    if (username) params.set('username', username);
    if (includeInactive) params.set('show_inactive', 'true');
    const url = `/api/posts${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    setPosts(data);
  }, []);

  const fetchScrapeStatus = useCallback(async () => {
    const res = await fetch('/api/scrape');
    const data = await res.json();
    setScrapeStatus(data);
  }, []);

  useEffect(() => {
    fetchTargets();
    fetchPosts(undefined, showInactive);
    fetchScrapeStatus();

    const interval = setInterval(fetchScrapeStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchTargets, fetchPosts, fetchScrapeStatus, showInactive]);

  useEffect(() => {
    if (!scrapeStatus.is_running) {
      fetchTargets();
      if (selectedTarget) {
        fetchPosts(selectedTarget, showInactive);
      } else {
        fetchPosts(undefined, showInactive);
      }
    }
  }, [scrapeStatus.is_running, fetchTargets, fetchPosts, selectedTarget, showInactive]);

  const addTarget = async () => {
    if (!newUsername.trim()) return;
    await fetch('/api/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername }),
    });
    setNewUsername('');
    fetchTargets();
  };

  const toggleTarget = async (id: number, is_active: boolean) => {
    await fetch(`/api/targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !is_active }),
    });
    fetchTargets();
  };

  const deleteTarget = async (id: number) => {
    if (!confirm('Delete this target and all its data?')) return;
    await fetch(`/api/targets/${id}`, { method: 'DELETE' });
    fetchTargets();
    fetchPosts();
  };

  const startScrape = async (username?: string) => {
    await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    fetchScrapeStatus();
  };

  const stopScrape = async () => {
    await fetch('/api/scrape', { method: 'DELETE' });
    fetchScrapeStatus();
  };

  const selectTarget = (username: string | null) => {
    setSelectedTarget(username);
    fetchPosts(username || undefined, showInactive);
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return '-';
    return num.toLocaleString();
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Instagram Scraper</h1>

        {scrapeStatus.is_running && (
          <div className="bg-blue-900 border border-blue-500 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="font-semibold">Scraping: @{scrapeStatus.username}</span>
                </div>
                <p className="text-blue-300 mt-1">{scrapeStatus.message}</p>
                {scrapeStatus.total && scrapeStatus.total > 0 && (
                  <div className="mt-2">
                    <div className="w-full bg-blue-950 rounded-full h-2">
                      <div
                        className="bg-blue-400 h-2 rounded-full transition-all"
                        style={{ width: `${(scrapeStatus.current || 0) / scrapeStatus.total * 100}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-blue-300 mt-1">
                      {scrapeStatus.current} / {scrapeStatus.total} posts
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={stopScrape}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-4">Targets</h2>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTarget()}
                  placeholder="user1, user2, user3"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={addTarget}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                >
                  Add
                </button>
              </div>

              <button
                onClick={() => startScrape()}
                disabled={scrapeStatus.is_running || targets.filter(t => t.is_active).length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded mb-4"
              >
                Scrape All Active ({targets.filter(t => t.is_active).length})
              </button>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                <button
                  onClick={() => selectTarget(null)}
                  className={`w-full text-left px-3 py-2 rounded ${
                    selectedTarget === null ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  All Posts
                </button>

                {targets.map((target) => (
                  <div
                    key={target.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded ${
                      selectedTarget === target.username ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <button
                      onClick={() => toggleTarget(target.id, target.is_active)}
                      className={`w-4 h-4 rounded border ${
                        target.is_active ? 'bg-green-500 border-green-500' : 'border-gray-500'
                      }`}
                    ></button>

                    <button
                      onClick={() => selectTarget(target.username)}
                      className="flex-1 text-left truncate"
                    >
                      <span className={target.is_active ? '' : 'text-gray-500'}>
                        @{target.username}
                      </span>
                      {target.followers && (
                        <span className="text-xs text-gray-400 ml-2">
                          {formatNumber(target.followers)} followers
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => startScrape(target.username)}
                      disabled={scrapeStatus.is_running}
                      className="text-blue-400 hover:text-blue-300 disabled:text-gray-600 text-sm"
                      title="Scrape"
                    >
                      ▶
                    </button>

                    <button
                      onClick={() => deleteTarget(target.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  Posts {selectedTarget && `- @${selectedTarget}`}
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({posts.length} posts)
                  </span>
                </h2>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                  />
                  <span className="text-gray-400">Show inactive</span>
                </label>
              </div>

              {posts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No posts yet. Add targets and start scraping.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="pb-2">User</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2 text-right">Likes</th>
                        <th className="pb-2 text-right">Views</th>
                        <th className="pb-2 text-right">Comments</th>
                        <th className="pb-2">Caption</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((post) => (
                        <tr key={post.id} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="py-2">
                            <a
                              href={`https://instagram.com/${post.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline"
                            >
                              @{post.username}
                            </a>
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              post.type === 'reel' ? 'bg-purple-900 text-purple-300' :
                              post.type === 'video' ? 'bg-red-900 text-red-300' :
                              'bg-gray-700 text-gray-300'
                            }`}>
                              {post.type}
                            </span>
                          </td>
                          <td className="py-2 text-gray-400">{formatDate(post.post_date)}</td>
                          <td className="py-2 text-right">{formatNumber(post.likes)}</td>
                          <td className="py-2 text-right">{formatNumber(post.views)}</td>
                          <td className="py-2 text-right">{formatNumber(post.comments_count)}</td>
                          <td className="py-2 max-w-xs truncate text-gray-400">
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-white"
                              title={post.caption || ''}
                            >
                              {post.caption || '-'}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
