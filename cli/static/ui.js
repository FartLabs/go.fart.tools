const form = document.querySelector("form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await add();
});

async function add(force = false) {
  // Read values from form.
  const formData = new FormData(form);
  const alias = formData.get("alias");
  if (typeof alias !== "string") {
    alert("Alias is required.");
    return;
  }

  const destination = formData.get("destination");
  if (typeof destination !== "string") {
    alert("Destination is required.");
    return;
  }

  // Send request to API.
  const token = formData.get("token");
  const response = await fetch("/api", {
    method: "POST",
    headers: { Authorization: `Token ${token}` },
    body: JSON.stringify({ alias, destination, force }),
  });

  // Handle response.
  await handleResponse(response);
}

async function handleResponse(response) {
  const body = await response.json();
  if (body.error) {
    if (alreadyExists(body.error) && confirm("Overwrite existing alias?")) {
      await add(true);
    } else if (unauthorized(body.error)) {
      alert("Unauthorized: Please check your token.");
      document.querySelector("[name=token]").focus();
    } else {
      alert(`Error: ${body.error}`);
    }

    return;
  }

  alert(`Success: ${body.message}`);
  const aliasInput = document.querySelector("[name=alias]");
  const destinationInput = document.querySelector("[name=destination]");
  aliasInput.value = "";
  destinationInput.value = "";
  aliasInput.focus();
}

function alreadyExists(error) {
  return error.toLowerCase().includes("shortlink already exists");
}

function unauthorized(error) {
  return error.toLowerCase().includes("unauthorized");
}
