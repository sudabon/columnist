// 権限要求の結果をタイトルに書き出す
Notification.requestPermission().then((result) => {
  document.title = result
})
