import React from "react";
import PropTypes from "prop-types";

function Home({ user }: { user: string }) {
  return <h1>Welcome {user}</h1>;
}

export default Home;

Home.propTypes = {
  user: PropTypes.string.isRequired,
};
