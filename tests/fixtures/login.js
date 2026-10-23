document.getElementById('login').addEventListener('click', () => {
  document.cookie = 'auth_token=dummy; path=/; max-age=31536000'
})
