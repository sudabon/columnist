const posts = document.getElementById('posts')
for (let i = 0; i < 100; i++) {
  const div = document.createElement('div')
  div.className = 'post'
  div.textContent = `ダミー投稿 ${i}`
  posts.appendChild(div)
}
document.body.dataset.loadedAt = String(Date.now())
