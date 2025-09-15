// public/login.js

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = '/'; // 로그인 성공 시 메인 페이지로 이동
        } else {
            errorMessage.textContent = data.message || '로그인에 실패했습니다.';
        }
    } catch (error) {
        errorMessage.textContent = '서버와 통신 중 오류가 발생했습니다.';
    }
});
