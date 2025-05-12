export async function makePostRequest(data) {
    url = 'https://example.com/api';
    const predefinedData = { key: 'value' };
    const requestData = { ...predefinedData, ...data };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        return responseData;
    } catch (error) {
        console.error('Error making POST request:', error.message);
        throw error;
    }
}
